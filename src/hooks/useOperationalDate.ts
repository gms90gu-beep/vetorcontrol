import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";


export function useOperationalDate() {
  const [isOperational, setIsOperational] = useState(true);
  const [allowWeekend, setAllowWeekend] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    async function checkOperationalStatus() {
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
        setIsOperational(true);
        setAllowWeekend(true);
      } catch (error) {
        console.error("Error in checkOperationalStatus:", error);
      } finally {
        setIsLoading(false);
      }
    }

    checkOperationalStatus();
  }, []);

  const toggleWeekendOperation = async (allowed: boolean) => {
    // This is now always true, but we keep the function for compatibility
    return true;
  };

  return { 
    isOperational: true, 
    allowWeekend: true, 
    isLoading, 
    userRole, 
    isWeekendToday: false, // Always false for access logic
    toggleWeekendOperation 
  };
}
