import React, { memo, useState, useMemo, useCallback } from 'react';
import LoadingButton from '../system/LoadingButton.tsx';
import { useBodyScrollLock, useModalStack } from '../system/ModalManager.tsx';

export interface UpgradableGroupOption {
  id: string;
  name: string;
  description?: string;
  priority: number;
  isDefault?: boolean;
}

export interface MemberUpgradeTarget {
  userId: string;
  userName: string;
  username?: string;
  currentGroupId?: string | null;
  currentGroupName?: string;
  currentGroupPriority?: number;
}

interface MemberUpgradeModalProps {
  member: MemberUpgradeTarget;
  upgradableGroups: UpgradableGroupOption[];
  actorPriority: number;
  onConfirm: (targetGroupId: string) => Promise<void> | void;
  onCancel: () => void;
}

const MemberUpgradeModal: React.FC<MemberUpgradeModalProps> = memo(({
  member,
  upgradableGroups,
  actorPriority,
  onConfirm,
  onCancel,
}) => {
  const modalId = useMemo(() => `ndd-member-upgrade_${Math.random().toString(36).slice(2, 9)}`, []);
  useBodyScrollLock(true);
  useModalStack(modalId, onCancel);

  const availableGroups = useMemo(() => {
    return upgradableGroups.filter(g => g.priority > actorPriority || actorPriority === 0);
  }, [upgradableGroups, actorPriority]);

  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => {
    const firstDifferent = availableGroups.find(g => g.id !== member.currentGroupId);
    return firstDifferent?.id || availableGroups[0]?.id || '';
  });

  const handleSave = useCallback(async () => {
    if (!selectedGroupId) return;
    console.log('[MemberUpgradeModal] Confirming member upgrade:', {
      userId: member.userId,
      userName: member.userName,
      targetGroupId: selectedGroupId,
    });
    await onConfirm(selectedGroupId);
  }, [selectedGroupId, member, onConfirm]);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-3 md:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Nâng cấp nhóm cho ${member.userName}`}
      data-testid="ndd-member-upgrade-modal"
      onClick={onCancel}
    >
      <div
        className="bg-white w-full max-w-md max-h-[calc(100dvh-24px)] overflow-y-auto overflow-x-hidden rounded-[2rem] p-5 sm:p-6 space-y-4 animate-in zoom-in-95"
        onClick={e => e.stopPropagation()}
      >
        <div>
          <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">
            ⬆️ Nâng cấp nhóm hội viên
          </h4>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Hội viên: <strong className="text-slate-800">{member.userName}</strong>
            {member.username ? ` (@${member.username})` : ''}
          </p>
          {member.currentGroupName && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              Nhóm hiện tại: <strong className="text-emerald-700">{member.currentGroupName}</strong>
              {typeof member.currentGroupPriority === 'number' && Number.isFinite(member.currentGroupPriority) && member.currentGroupPriority < 1000000
                ? ` (Priority ${member.currentGroupPriority})`
                : ''}
            </p>
          )}
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {availableGroups.length === 0 ? (
            <div className="p-6 text-center rounded-2xl bg-slate-50 text-xs text-slate-400 italic">
              Chưa có nhóm nào được bật cho phép nâng cấp phù hợp với quyền hạn của bạn.
            </div>
          ) : (
            availableGroups.map(group => {
              const isSelected = selectedGroupId === group.id;
              const isCurrent = member.currentGroupId === group.id;
              return (
                <label
                  key={group.id}
                  data-testid={`upgrade-group-option-${group.id}`}
                  onClick={() => setSelectedGroupId(group.id)}
                  className={`flex items-center justify-between gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-emerald-50 border-emerald-400 shadow-sm'
                      : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="radio"
                      name="targetUpgradeGroup"
                      checked={isSelected}
                      onChange={() => setSelectedGroupId(group.id)}
                      className="accent-emerald-600"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-800 truncate">{group.name}</span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[9px] font-black uppercase">
                            Hiện tại
                          </span>
                        )}
                      </div>
                      {group.description && (
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">{group.description}</p>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-black text-slate-600">
                    Priority {group.priority}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-500 font-black uppercase text-[10px] hover:bg-slate-200 transition-all"
          >
            Hủy
          </button>
          <LoadingButton
            onClick={handleSave}
            disabled={!selectedGroupId || availableGroups.length === 0}
            variant="primary"
            size="lg"
            loadingText="Đang nâng cấp..."
            className="!flex-1"
            data-testid="confirm-member-upgrade-btn"
          >
            Xác nhận nâng cấp
          </LoadingButton>
        </div>
      </div>
    </div>
  );
});

MemberUpgradeModal.displayName = 'MemberUpgradeModal';

export default MemberUpgradeModal;
