import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Hook to manage operational availability.
 * Weekends are now always allowed as requested.
 */
export function useOperationalDate() {
  const [isOperational] = useState(true);
  const { role: userRole, isLoading } = useAuth();

  // For backward compatibility while we remove references
  const toggleWeekendOperation = async () => true;

  return { 
    isOperational, 
    allowWeekend: true, 
    isLoading, 
    userRole, 
    isWeekendToday: false, // Weekends are now considered operational days
    toggleWeekendOperation 
  };
}
