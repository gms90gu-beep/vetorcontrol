import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isWeekend } from "date-fns";

export function useOperationalDate() {
  const [isOperational, setIsOperational] = useState(true);
  const [allowWeekend, setAllowWeekend] = useState(false);
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

        // Get system settings
        const { data: settings, error } = await supabase
          .from("system_settings")
          .select("allow_weekend_operation")
          .single();

        if (error) {
          console.error("Error fetching system settings:", error);
        }

        const allowWeekendOp = settings?.allow_weekend_operation || false;
        setAllowWeekend(allowWeekendOp);

        const today = new Date();
        const weekend = isWeekend(today);

        // If it's weekend and not allowed, it's not operational
        setIsOperational(!weekend || allowWeekendOp);
      } catch (error) {
        console.error("Error in checkOperationalStatus:", error);
      } finally {
        setIsLoading(false);
      }
    }

    checkOperationalStatus();
  }, []);

  const toggleWeekendOperation = async (allowed: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from("system_settings")
        .update({ 
          allow_weekend_operation: allowed,
          updated_by: session.user.id,
          updated_at: new Date().toISOString()
        })
        .match({ allow_weekend_operation: !allowed }); // Update all records (there should be only one)

      if (!error) {
        setAllowWeekend(allowed);
        const today = new Date();
        setIsOperational(!isWeekend(today) || allowed);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error toggling weekend operation:", error);
      return false;
    }
  };

  return { 
    isOperational, 
    allowWeekend, 
    isLoading, 
    userRole, 
    isWeekendToday: isWeekend(new Date()),
    toggleWeekendOperation 
  };
}
