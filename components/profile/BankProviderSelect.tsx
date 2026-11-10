import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  findVietQrProvider,
  stripVietnameseAccents,
  VIETQR_PROVIDERS,
  VietQrProviderOption,
} from '../../utils/vietQr.ts';

export interface BankProviderSelectProps {
  value: string;
  onChange: (bankCode: string) => void;
}

const BankProviderSelect: React.FC<BankProviderSelectProps> = memo(({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const selectedProvider = useMemo(() => findVietQrProvider(value), [value]);

  const filteredProviders = useMemo(() => {
    const q = stripVietnameseAccents(searchQuery).toLowerCase();
    if (!q) return VIETQR_PROVIDERS;
    return VIETQR_PROVIDERS.filter(provider => {
      const haystack = stripVietnameseAccents(
        `${provider.code} ${provider.shortName} ${provider.name} ${provider.bin}`
      ).toLowerCase();
      return haystack.includes(q);
    });
  }, [searchQuery]);

  const bankOptions = useMemo(
    () => filteredProviders.filter(provider => provider.group === 'bank'),
    [filteredProviders]
  );

  const walletOptions = useMemo(
    () => filteredProviders.filter(provider => provider.group === 'wallet'),
    [filteredProviders]
  );

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 30);
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const handleToggleOpen = useCallback(() => {
    setOpen(prev => {
      const next = !prev;
      if (next) setSearchQuery('');
      console.log('[BankProviderSelect] Dropdown toggled:', { open: next });
      return next;
    });
  }, []);

  const handleSelectOption = useCallback(
    (code: string) => {
      console.log('[BankProviderSelect] Selected provider:', { code });
      onChange(code);
      setOpen(false);
      setSearchQuery('');
    },
    [onChange]
  );

  const renderOption = (provider: VietQrProviderOption) => {
    const isSelected = selectedProvider?.code === provider.code;
    return (
      <button
        key={provider.code}
        type="button"
        role="option"
        aria-selected={isSelected}
        data-testid={`profile-bank-option-${provider.code}`}
        onClick={() => handleSelectOption(provider.code)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-xs transition sm:text-sm ${
          isSelected
            ? 'bg-emerald-50 font-bold text-emerald-800'
            : 'text-slate-700 hover:bg-slate-100'
        }`}
      >
        <span className="min-w-0 flex-1 break-words">
          <b className="text-slate-900">{provider.shortName}</b> — {provider.name}
        </span>
        {isSelected && <span className="shrink-0 font-black text-emerald-700">✓</span>}
      </button>
    );
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        id="profile-bank-name"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="profile-bank-name"
        onClick={handleToggleOpen}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-transparent bg-slate-50 px-4 py-3 text-left text-sm font-medium outline-none focus:border-emerald-500"
      >
        <span className={`min-w-0 flex-1 truncate ${selectedProvider ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>
          {selectedProvider
            ? `${selectedProvider.shortName} — ${selectedProvider.name}`
            : '-- Chọn ngân hàng hoặc ví điện tử (VietQR, MoMo, VNPay...) --'}
        </span>
        <span className="shrink-0 text-xs text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          role="listbox"
          data-testid="profile-bank-dropdown"
          className="absolute left-0 right-0 z-40 mt-1.5 max-h-80 overflow-y-auto overflow-x-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        >
          {/* Dòng đầu tiên: Ô nhập text tìm kiếm ngân hàng / ví điện tử */}
          <div className="sticky top-0 z-10 border-b border-slate-100 bg-white p-2">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Nhập tên hoặc mã ngân hàng / ví để tìm..."
              data-testid="profile-bank-search"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500 focus:bg-white sm:text-sm"
            />
          </div>

          <div className="p-1.5 space-y-2">
            {value && !searchQuery.trim() && (
              <button
                type="button"
                onClick={() => handleSelectOption('')}
                className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50"
              >
                ✕ Bỏ chọn ngân hàng / ví điện tử
              </button>
            )}

            {bankOptions.length > 0 && (
              <div>
                <div className="px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-400">
                  🏦 Ngân hàng tại Việt Nam (VietQR / Napas247)
                </div>
                <div className="space-y-0.5">{bankOptions.map(renderOption)}</div>
              </div>
            )}

            {walletOptions.length > 0 && (
              <div>
                <div className="px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-400">
                  📱 Ví điện tử tại Việt Nam (MoMo, VNPay, ZaloPay...)
                </div>
                <div className="space-y-0.5">{walletOptions.map(renderOption)}</div>
              </div>
            )}

            {!filteredProviders.length && (
              <p className="py-6 text-center text-xs text-slate-500">
                Không tìm thấy ngân hàng hoặc ví điện tử phù hợp với “{searchQuery}”.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

BankProviderSelect.displayName = 'BankProviderSelect';
export default BankProviderSelect;
