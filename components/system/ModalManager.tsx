import React, { createContext, useContext, useEffect, useRef, useCallback, useState } from 'react';

/**
 * Modal Stack Context
 * Quản lý stack các modal đang mở để hỗ trợ:
 * - ESC đóng modal theo thứ tự LIFO (mở sau đóng trước)
 * - Lock body scroll khi có modal mở
 */

interface ModalEntry {
  id: string;
  onClose: () => void;
}

interface ModalStackContextType {
  pushModal: (id: string, onClose: () => void) => void;
  popModal: (id: string) => void;
  modalCount: number;
}

const ModalStackContext = createContext<ModalStackContextType>({
  pushModal: () => {},
  popModal: () => {},
  modalCount: 0,
});

/**
 * Body Scroll Lock Hook
 * Lock/unlock body overflow khi modal mở/đóng
 */
export const useBodyScrollLock = (active: boolean): void => {
  useEffect(() => {
    if (active) {
      const originalOverflow = document.body.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;

      // Tính toán scrollbar width để tránh layout shift
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }

      console.log(`[BodyScrollLock] Locked (scrollbar: ${scrollbarWidth}px)`);

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
        console.log('[BodyScrollLock] Unlocked');
      };
    }
  }, [active]);
};

/**
 * Modal Stack Hook
 * Đăng ký modal vào stack khi mount, hủy đăng ký khi unmount.
 * Khi bấm ESC, modal trên cùng (cuối stack) sẽ được đóng.
 */
export const useModalStack = (modalId: string, onClose: () => void): void => {
  const { pushModal, popModal } = useContext(ModalStackContext);
  const callbackRef = useRef(onClose);

  // Luôn cập nhật callback ref khi onClose thay đổi
  callbackRef.current = onClose;

  useEffect(() => {
    // Push modal vào stack với callback mới nhất
    pushModal(modalId, () => callbackRef.current());

    console.log(`[ModalStack] Push: ${modalId}`);

    return () => {
      popModal(modalId);
      console.log(`[ModalStack] Pop: ${modalId}`);
    };
  }, [modalId, pushModal, popModal]);
};

export const ModalStackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const stackRef = useRef<ModalEntry[]>([]);
  const [modalCount, setModalCount] = useState(0);

  const pushModal = useCallback((id: string, onClose: () => void) => {
    stackRef.current = [...stackRef.current, { id, onClose }];
    setModalCount(stackRef.current.length);
  }, []);

  const popModal = useCallback((id: string) => {
    stackRef.current = stackRef.current.filter(entry => entry.id !== id);
    setModalCount(stackRef.current.length);
  }, []);

  // Global keydown listener for ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stackRef.current.length > 0) {
        const topModal = stackRef.current[stackRef.current.length - 1];
        console.log(`[ModalStack] ESC pressed, closing: ${topModal.id}`);
        topModal.onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  console.log(`[ModalStack] Provider: ${modalCount} modal(s) active`);

  return (
    <ModalStackContext.Provider value={{ pushModal, popModal, modalCount }}>
      {children}
    </ModalStackContext.Provider>
  );
};

export default ModalStackProvider;