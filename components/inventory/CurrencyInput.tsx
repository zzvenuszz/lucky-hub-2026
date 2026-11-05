import React, { memo, useRef } from 'react';
import { formatGroupedInteger, parseGroupedInteger } from '../../utils/formatters.ts';

interface CurrencyInputProps {
  value: string | number;
  onValueChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
  dataTestId?: string;
  readOnly?: boolean;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

const digitPosition = (text: string, digitCount: number) => {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (/\d/.test(text[index])) seen += 1;
    if (seen >= digitCount) return index + 1;
  }
  return text.length;
};

const CurrencyInput: React.FC<CurrencyInputProps> = memo(({ value, onValueChange, className, ariaLabel, dataTestId, readOnly = false, disabled = false, required = false, placeholder }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const formattedValue = formatGroupedInteger(value);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = event.currentTarget.value;
    const selection = event.currentTarget.selectionStart ?? inputValue.length;
    const digitsBeforeCaret = parseGroupedInteger(inputValue.slice(0, selection)).length;
    const rawValue = parseGroupedInteger(inputValue);
    onValueChange(rawValue);
    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      const nextPosition = digitPosition(formatGroupedInteger(rawValue), digitsBeforeCaret);
      input.setSelectionRange(nextPosition, nextPosition);
    });
  };

  return <input
    ref={inputRef}
    type="text"
    inputMode="numeric"
    pattern="[0-9 ]*"
    value={formattedValue}
    onChange={handleChange}
    className={className}
    aria-label={ariaLabel}
    data-testid={dataTestId}
    readOnly={readOnly}
    disabled={disabled}
    required={required}
    placeholder={placeholder}
  />;
});

CurrencyInput.displayName = 'CurrencyInput';
export default CurrencyInput;
