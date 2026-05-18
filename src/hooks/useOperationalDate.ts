import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook to manage operational availability.
 * Weekends are now always allowed as requested.
 */
export function useOperationalDate() {
  const [isOperational] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUserRole() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Get user role
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .maybeSingle();
        
        setUserRole(roleData?.role || null);
      } catch (error) {
        console.error("Error fetching user role:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchUserRole();
  }, []);

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
