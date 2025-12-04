'use client';

import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-white group-[.toaster]:text-gray-900 group-[.toaster]:border-gray-200 group-[.toaster]:shadow-lg dark:group-[.toaster]:bg-gray-950 dark:group-[.toaster]:text-gray-100 dark:group-[.toaster]:border-gray-800',
          description:
            'group-[.toast]:text-gray-500 dark:group-[.toast]:text-gray-400',
          actionButton:
            'group-[.toast]:bg-blue-600 group-[.toast]:text-white hover:group-[.toast]:bg-blue-700',
          cancelButton:
            'group-[.toast]:bg-gray-100 group-[.toast]:text-gray-900 hover:group-[.toast]:bg-gray-200 dark:group-[.toast]:bg-gray-800 dark:group-[.toast]:text-gray-100',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
