import { toast } from "sonner";

/**
 * Standardized notification helper. Always use this instead of importing
 * `toast` directly so all feedback shares tone, duration, and a11y defaults.
 */
export const notify = {
  success: (message: string, description?: string) =>
    toast.success(message, { description, duration: 3500 }),
  error: (message: string, description?: string) =>
    toast.error(message, { description, duration: 5000 }),
  warning: (message: string, description?: string) =>
    toast.warning(message, { description, duration: 4500 }),
  info: (message: string, description?: string) =>
    toast.info(message, { description, duration: 3500 }),
  message: (message: string, description?: string) =>
    toast(message, { description, duration: 3000 }),
  promise: toast.promise.bind(toast),
};
