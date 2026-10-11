import { createHash } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { MagicMirrorToken } from '../models/MagicMirrorToken.ts';

export async function isMagicMirrorTokenValid(providedToken: string): Promise<boolean> {
  const tokenHash = createHash('sha256').update(providedToken).digest('hex');
  const now = new Date();
  const token = await MagicMirrorToken.findOne({
    tokenHash,
    isActive: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  }).select('_id');

  return Boolean(token);
}

export async function magicMirrorAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authorization = req.get('authorization') || '';
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    const providedToken = match?.[1];
    if (!providedToken) {
      res.status(401).json({ message: 'Magic Mirror token is required.' });
      return;
    }

    if (!(await isMagicMirrorTokenValid(providedToken))) {
      res.status(401).json({ message: 'Magic Mirror token is invalid, inactive, or expired.' });
      return;
    }

    next();
  } catch (error) {
    console.error('[MagicMirrorAuth] Token verification failed:', error);
    res.status(500).json({ message: 'Magic Mirror authentication failed.' });
  }
}
