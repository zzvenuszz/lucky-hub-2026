import { WebSocketServer, WebSocket } from 'ws';
import { Chat } from '../models/Chat.ts';
import { Notification } from '../models/Notification.ts';
import { logger } from '../../src/utils/logger.ts';

// Maps
export const userWsConnections = new Map<string, Set<WebSocket>>();
export const onlineUsers = new Map<string, boolean>();

function sendToUser(userId: string, message: any) {
  const connections = userWsConnections.get(userId);
  if (!connections) return;
  const data = JSON.stringify(message);
  connections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

let wssRef: WebSocketServer | null = null;

export function initChatWebSocket(wss: WebSocketServer) {
  wssRef = wss;

  wss.on('connection', (ws: WebSocket, req) => {
    const ip = req.socket.remoteAddress || 'unknown';
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Chỉ xử lý kết nối chat tại /ws, còn lại cho Magic Mirror
    if (pathname !== '/ws') {
      logger.ws(`[MM] Connection from ${ip}. Total: ${wss.clients.size}`);
      
      ws.on('message', (data) => {
        logger.ws(`[MM] Message from ${ip}: ${data}`);
      });
      ws.on('close', () => {
        logger.ws(`[MM] Closed ${ip}. Remaining: ${wss.clients.size}`);
      });
      ws.on('error', (err) => {
        logger.error('MM', `Error from ${ip}: ${err.message}`);
      });
      return;
    }

    // ===== CHAT CONNECTION =====
    const userId = url.searchParams.get('userId') || '';
    const sessionId = url.searchParams.get('sessionId') || '';
    const userRole = url.searchParams.get('role') || '';

    if (!userId) {
      ws.close(4001, 'Missing userId');
      return;
    }

    console.log(`[WebSocket] ✅ Chat client connected: userId=${userId}, ip=${ip}`);

    // Track connections
    if (!userWsConnections.has(userId)) {
      userWsConnections.set(userId, new Set());
    }
    userWsConnections.get(userId)!.add(ws);

    // Broadcast online
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, true);
      broadcastToAll({ event: 'user:online', payload: { userId, online: true, timestamp: new Date().toISOString() } });
    }

    // Handle incoming messages
    ws.on('message', async (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString());
        const { event, payload } = msg;

        if (event === 'ping') {
          ws.send(JSON.stringify({ event: 'pong', timestamp: new Date().toISOString() }));
          return;
        }

        console.log(`[WebSocket] 📥 ${event} from userId=${userId}:`, JSON.stringify(payload).substring(0, 150));

        switch (event) {
          case 'chat:message': {
            const { chatId, message, recipientId } = payload;
            
            await Chat.findOneAndUpdate(
              { id: chatId },
              { $push: { messages: message }, $setOnInsert: { id: chatId, memberId: payload.memberId || userId, coachId: payload.coachId || recipientId } },
              { upsert: true, new: true }
            );

            message.status = 'sent';

            sendToUser(userId, {
              event: 'chat:messageSent',
              payload: { chatId, messageId: message.id, status: 'sent', timestamp: new Date().toISOString() }
            });

            if (recipientId && recipientId !== userId) {
              sendToUser(recipientId, {
                event: 'chat:message',
                payload: { chatId, message, fromUserId: userId }
              });

              // Notification
              const senderName = message.senderName || 'Ai đó';
              const notif = new Notification({
                userId: recipientId, type: 'message',
                message: `📩 ${senderName}: "${message.content?.substring(0, 100)}"`,
                link: `/chat/${chatId}`
              });
              await notif.save();
            }
            break;
          }

          case 'chat:typing': {
            const { chatId, recipientId, userName } = payload;
            if (recipientId && recipientId !== userId) {
              sendToUser(recipientId, { event: 'chat:typing', payload: { chatId, userId, userName, isTyping: true } });
            }
            break;
          }

          case 'chat:stopTyping': {
            const { chatId, recipientId } = payload;
            if (recipientId && recipientId !== userId) {
              sendToUser(recipientId, { event: 'chat:typing', payload: { chatId, userId, isTyping: false } });
            }
            break;
          }

          case 'chat:reaction': {
            const { chatId, messageId, reaction, recipientId } = payload;
            const chat = await Chat.findOne({ id: chatId });
            if (chat) {
              const updatedMsgs = chat.messages.map((m: any) => {
                if (m.id === messageId) {
                  const existingReactions = m.reactions || [];
                  const existingIdx = existingReactions.findIndex((r: any) => r.userId === reaction.userId && r.emoji === reaction.emoji);
                  if (existingIdx >= 0) existingReactions.splice(existingIdx, 1);
                  else existingReactions.push(reaction);
                  return { ...m, reactions: existingReactions };
                }
                return m;
              });
              await Chat.findOneAndUpdate({ id: chatId }, { $set: { messages: updatedMsgs } });
            }
            if (recipientId && recipientId !== userId) {
              sendToUser(recipientId, { event: 'chat:reaction', payload: { chatId, messageId, reaction } });
            }
            break;
          }

          case 'chat:read': {
            const { chatId, lastReadMessageId, recipientId } = payload;
            await Chat.findOneAndUpdate({ id: chatId }, { $set: { [`lastReadBy.${userId}`]: lastReadMessageId } });
            if (recipientId && recipientId !== userId) {
              sendToUser(recipientId, { event: 'chat:read', payload: { chatId, userId, lastReadMessageId } });
            }
            break;
          }

          case 'chat:edit': {
            const { chatId, messageId, newContent, recipientId } = payload;
            const chat = await Chat.findOne({ id: chatId });
            if (chat) {
              const updatedMsgs = chat.messages.map((m: any) => {
                if (m.id === messageId) return { ...m, content: newContent, editedAt: new Date().toISOString() };
                return m;
              });
              await Chat.findOneAndUpdate({ id: chatId }, { $set: { messages: updatedMsgs } });
            }
            if (recipientId && recipientId !== userId) {
              sendToUser(recipientId, { event: 'chat:edit', payload: { chatId, messageId, newContent, editedAt: new Date().toISOString() } });
            }
            break;
          }

          case 'chat:delete': {
            const { chatId, messageId, recipientId } = payload;
            const chat = await Chat.findOne({ id: chatId });
            if (chat) {
              const updatedMsgs = chat.messages.filter((m: any) => m.id !== messageId);
              await Chat.findOneAndUpdate({ id: chatId }, { $set: { messages: updatedMsgs } });
            }
            if (recipientId && recipientId !== userId) {
              sendToUser(recipientId, { event: 'chat:delete', payload: { chatId, messageId } });
            }
            break;
          }

          case 'chat:clear': {
            const { chatId, recipientId } = payload;
            await Chat.findOneAndUpdate({ id: chatId }, { $set: { messages: [] } });
            if (recipientId && recipientId !== userId) {
              sendToUser(recipientId, { event: 'chat:clear', payload: { chatId } });
            }
            break;
          }

          case 'chat:aiChoice': {
            const { chatId, messageId, choice, chosenBy, chosenByName, recipientId } = payload;
            const chat = await Chat.findOne({ id: chatId });
            if (chat) {
              const updatedMsgs = chat.messages.map((m: any) => {
                if (m.id === messageId) {
                  return { ...m, meta: { chosenBy, chosenByName, choice, chosenAt: new Date().toISOString() } };
                }
                return m;
              });
              await Chat.findOneAndUpdate({ id: chatId }, { $set: { messages: updatedMsgs } });
            }
            if (recipientId && recipientId !== userId) {
              sendToUser(recipientId, { event: 'chat:aiChoiceUpdated', payload: { chatId, messageId, meta: { chosenBy, chosenByName, choice, chosenAt: new Date().toISOString() } } });
            }
            break;
          }

          case 'comment:new': {
            const { postId, targetUserId, actorId, actorName, commentId, parentId } = payload;
            if (targetUserId && targetUserId !== userId) {
              const type = parentId ? 'reply' : 'comment';
              const msg = parentId 
                ? `${actorName} đã trả lời bình luận của bạn.`
                : `${actorName} đã bình luận về bài viết của bạn.`;
              sendToUser(targetUserId, { 
                event: 'notification:new', 
                payload: { type, message: msg, link: `/posts/${postId}`, timestamp: new Date().toISOString(), referenceId: postId, actorId, actorName } 
              });
            }
            break;
          }

          case 'tag:new': {
            const { postId, targetUserId, actorName, context } = payload;
            if (targetUserId && targetUserId !== userId) {
              const msg = `${actorName} đã tag bạn trong ${context || 'một bài viết'}.`;
              sendToUser(targetUserId, { 
                event: 'notification:new', 
                payload: { type: 'tag', message: msg, link: `/posts/${postId}`, timestamp: new Date().toISOString(), referenceId: postId, actorId: userId, actorName } 
              });
            }
            break;
          }

          case 'goal:completed': {
            const { targetUserId, goalType } = payload;
            if (targetUserId) {
              const msg = `🎉 Chúc mừng! Bạn đã hoàn thành mục tiêu "${goalType}"!`;
              sendToUser(targetUserId, { 
                event: 'notification:new', 
                payload: { type: 'goal_completed', message: msg, link: '/goals', timestamp: new Date().toISOString() } 
              });
            }
            break;
          }

          case 'goal:reminder': {
            const { targetUserId, goalType, daysLeft } = payload;
            if (targetUserId) {
              const msg = daysLeft > 0
                ? `⏰ Còn ${daysLeft} ngày để hoàn thành mục tiêu "${goalType}"!`
                : `⚠️ Mục tiêu "${goalType}" đã quá hạn! Hãy cập nhật ngay.`;
              sendToUser(targetUserId, { 
                event: 'notification:new', 
                payload: { type: 'goal_reminder', message: msg, link: '/goals', timestamp: new Date().toISOString() } 
              });
            }
            break;
          }

          case 'notification:send': {
            const { targetUserId, type, message, link } = payload;
            const notif = new Notification({ userId: targetUserId, type, message, link, read: false });
            await notif.save();
            sendToUser(targetUserId, { event: 'notification:new', payload: { type, message, link, timestamp: new Date().toISOString(), id: notif._id.toString() } });
            break;
          }

          case 'post:reacted': {
            const { postId, targetUserId, userId: reactorId, userName, type } = payload;
            if (targetUserId && targetUserId !== reactorId) {
              const reactTypes: Record<string, string> = { 'like': '👍 thích', 'love': '❤️ yêu thích', 'laugh': '😂 cười', 'wow': '😮 ngạc nhiên', 'sad': '😢 buồn', 'angry': '😠 tức giận' };
              const msg = `${userName || 'Ai đó'} đã bày tỏ cảm xúc "${reactTypes[type] || type}" bài viết của bạn.`;
              sendToUser(targetUserId, { event: 'notification:new', payload: { type: 'reaction', message: msg, link: `/posts/${postId}`, timestamp: new Date().toISOString() } });
            }
            break;
          }

          case 'metric:updated': {
            const { targetUserId, actorName } = payload;
            if (targetUserId && targetUserId !== userId) {
              const msg = `📊 ${actorName || 'Huấn luyện viên'} đã cập nhật chỉ số sức khỏe cho bạn.`;
              sendToUser(targetUserId, { event: 'notification:new', payload: { type: 'metric_help', message: msg, link: '/metrics', timestamp: new Date().toISOString() } });
            }
            break;
          }

          default:
            console.log(`[WebSocket] Unknown event: ${event}`);
        }
      } catch (err: any) {
        console.error(`[WebSocket] Error processing message:`, err.message);
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      console.log(`[WebSocket] ❌ Chat client disconnected: userId=${userId}`);

      const connections = userWsConnections.get(userId);
      if (connections) {
        connections.delete(ws);
        if (connections.size === 0) {
          userWsConnections.delete(userId);
          onlineUsers.delete(userId);
          
          setTimeout(() => {
            if (!onlineUsers.has(userId)) {
              broadcastToAll({ event: 'user:offline', payload: { userId, online: false, timestamp: new Date().toISOString() } });
            }
          }, 3000);
        }
      }
    });

    ws.on('error', (err) => {
      console.error(`[WebSocket] Error for userId=${userId}:`, err.message);
    });
  });

  // Broadcast online users periodically
  setInterval(() => {
    const onlineList = Array.from(onlineUsers.keys());
    broadcastToAll({ event: 'users:online', payload: { userIds: onlineList, timestamp: new Date().toISOString() } });
  }, 60000);

  console.log('[WebSocket] ✅ Chat real-time initialized');
}

function broadcastToAll(message: any) {
  if (!wssRef) return;
  const data = JSON.stringify(message);
  wssRef.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Broadcast to Magic Mirrors
export function broadcastToMirrors(type: string, data: any) {
  if (!wssRef) return;
  logger.ws(`Broadcasting ${type} to ${wssRef.clients.size} mirrors...`);
  const message = JSON.stringify({ type, data });
  let count = 0;
  wssRef.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      count++;
    }
  });
  logger.ws(`Sent ${type} to ${count} mirrors.`);
}