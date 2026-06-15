export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agents: {
        Row: {
          created_at: string | null
          id: string
          municipality: string | null
          name: string
          phone: string | null
          photo_url: string | null
          profile_id: string | null
          registration_id: string | null
          status: string | null
          team: string | null
          updated_at: string | null
          work_status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          municipality?: string | null
          name: string
          phone?: string | null
          photo_url?: string | null
          profile_id?: string | null
          registration_id?: string | null
          status?: string | null
          team?: string | null
          updated_at?: string | null
          work_status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          municipality?: string | null
          name?: string
          phone?: string | null
          photo_url?: string | null
          profile_id?: string | null
          registration_id?: string | null
          status?: string | null
          team?: string | null
          updated_at?: string | null
          work_status?: string | null
        }
        Relationships: []
      }
      areas: {
        Row: {
          code: string | null
          id: string
          name: string
        }
        Insert: {
          code?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          entity: string
          id: string
          ip_address: string | null
          metadata: Json | null
          target_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          target_id?: string | null
        }
        Relationships: []
      }
      blocks: {
        Row: {
          address: string | null
          city: string | null
          id: string
          latitude: number | null
          location_source: string | null
          longitude: number | null
          neighborhood: string | null
          number: string
          status: Database["public"]["Enums"]["block_status"]
          subarea_id: string
          total_properties: number | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          id?: string
          latitude?: number | null
          location_source?: string | null
          longitude?: number | null
          neighborhood?: string | null
          number: string
          status?: Database["public"]["Enums"]["block_status"]
          subarea_id: string
          total_properties?: number | null
        }
        Update: {
          address?: string | null
          city?: string | null
          id?: string
          latitude?: number | null
          location_source?: string | null
          longitude?: number | null
          neighborhood?: string | null
          number?: string
          status?: Database["public"]["Enums"]["block_status"]
          subarea_id?: string
          total_properties?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "blocks_subarea_id_fkey"
            columns: ["subarea_id"]
            isOneToOne: false
            referencedRelation: "subareas"
            referencedColumns: ["id"]
          },
        ]
      }
      boletins_rg: {
        Row: {
          agent_id: string
          agent_name: string | null
          agent_registration: string | null
          block_id: string | null
          block_number: string | null
          category_1: string | null
          category_2: string | null
          created_at: string
          district: string | null
          finalized_at: string | null
          id: string
          inspector: string | null
          inspector_general: string | null
          locality: string | null
          municipality: string | null
          sequence: string | null
          side: string | null
          subdistrict: string | null
          sublocality: string | null
          team_lead: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          agent_name?: string | null
          agent_registration?: string | null
          block_id?: string | null
          block_number?: string | null
          category_1?: string | null
          category_2?: string | null
          created_at?: string
          district?: string | null
          finalized_at?: string | null
          id?: string
          inspector?: string | null
          inspector_general?: string | null
          locality?: string | null
          municipality?: string | null
          sequence?: string | null
          side?: string | null
          subdistrict?: string | null
          sublocality?: string | null
          team_lead?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          agent_name?: string | null
          agent_registration?: string | null
          block_id?: string | null
          block_number?: string | null
          category_1?: string | null
          category_2?: string | null
          created_at?: string
          district?: string | null
          finalized_at?: string | null
          id?: string
          inspector?: string | null
          inspector_general?: string | null
          locality?: string | null
          municipality?: string | null
          sequence?: string | null
          side?: string | null
          subdistrict?: string | null
          sublocality?: string | null
          team_lead?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "boletins_rg_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      cycles: {
        Row: {
          created_at: string
          end_date: string
          id: string
          name: string
          number: number | null
          start_date: string
          status: Database["public"]["Enums"]["cycle_status"]
          updated_at: string | null
          year: number | null
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          name: string
          number?: number | null
          start_date: string
          status?: Database["public"]["Enums"]["cycle_status"]
          updated_at?: string | null
          year?: number | null
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          number?: number | null
          start_date?: string
          status?: Database["public"]["Enums"]["cycle_status"]
          updated_at?: string | null
          year?: number | null
        }
        Relationships: []
      }
      daily_work_records: {
        Row: {
          agent_id: string
          blocks_completed: number | null
          blocks_worked: number | null
          cargas_collected: number
          created_at: string
          cycle_id: string
          data_integrity_log: Json | null
          deposits_a1: number | null
          deposits_a2: number | null
          deposits_b: number | null
          deposits_by_type: Json
          deposits_c: number | null
          deposits_d1: number | null
          deposits_d2: number | null
          deposits_e: number | null
          deposits_eliminated: number | null
          deposits_existing: number | null
          deposits_inspected: number | null
          deposits_treated: number | null
          end_time: string | null
          epi_week: number | null
          epi_year: number | null
          foci_by_type: Json
          id: string
          is_retroactive: boolean
          larvae_collected: number
          larvicide_amount: number | null
          larvicide_unit: string | null
          pending_visits: number | null
          positive_foci: number | null
          properties_closed: number | null
          properties_positive: number
          properties_recovered: number | null
          properties_refused: number | null
          properties_worked: number | null
          retroactive_reason: string | null
          samples_collected: number | null
          samples_total: number
          start_time: string
          status: string
          strategic_points_worked: number
          tubitos_collected: number | null
          tubitos_properties: number
          tubitos_used: number
          updated_at: string
          week_id: string | null
          work_date: string
        }
        Insert: {
          agent_id: string
          blocks_completed?: number | null
          blocks_worked?: number | null
          cargas_collected?: number
          created_at?: string
          cycle_id: string
          data_integrity_log?: Json | null
          deposits_a1?: number | null
          deposits_a2?: number | null
          deposits_b?: number | null
          deposits_by_type?: Json
          deposits_c?: number | null
          deposits_d1?: number | null
          deposits_d2?: number | null
          deposits_e?: number | null
          deposits_eliminated?: number | null
          deposits_existing?: number | null
          deposits_inspected?: number | null
          deposits_treated?: number | null
          end_time?: string | null
          epi_week?: number | null
          epi_year?: number | null
          foci_by_type?: Json
          id?: string
          is_retroactive?: boolean
          larvae_collected?: number
          larvicide_amount?: number | null
          larvicide_unit?: string | null
          pending_visits?: number | null
          positive_foci?: number | null
          properties_closed?: number | null
          properties_positive?: number
          properties_recovered?: number | null
          properties_refused?: number | null
          properties_worked?: number | null
          retroactive_reason?: string | null
          samples_collected?: number | null
          samples_total?: number
          start_time?: string
          status: string
          strategic_points_worked?: number
          tubitos_collected?: number | null
          tubitos_properties?: number
          tubitos_used?: number
          updated_at?: string
          week_id?: string | null
          work_date?: string
        }
        Update: {
          agent_id?: string
          blocks_completed?: number | null
          blocks_worked?: number | null
          cargas_collected?: number
          created_at?: string
          cycle_id?: string
          data_integrity_log?: Json | null
          deposits_a1?: number | null
          deposits_a2?: number | null
          deposits_b?: number | null
          deposits_by_type?: Json
          deposits_c?: number | null
          deposits_d1?: number | null
          deposits_d2?: number | null
          deposits_e?: number | null
          deposits_eliminated?: number | null
          deposits_existing?: number | null
          deposits_inspected?: number | null
          deposits_treated?: number | null
          end_time?: string | null
          epi_week?: number | null
          epi_year?: number | null
          foci_by_type?: Json
          id?: string
          is_retroactive?: boolean
          larvae_collected?: number
          larvicide_amount?: number | null
          larvicide_unit?: string | null
          pending_visits?: number | null
          positive_foci?: number | null
          properties_closed?: number | null
          properties_positive?: number
          properties_recovered?: number | null
          properties_refused?: number | null
          properties_worked?: number | null
          retroactive_reason?: string | null
          samples_collected?: number | null
          samples_total?: number
          start_time?: string
          status?: string
          strategic_points_worked?: number
          tubitos_collected?: number | null
          tubitos_properties?: number
          tubitos_used?: number
          updated_at?: string
          week_id?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_work_records_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_work_records_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycle_coverage_summary"
            referencedColumns: ["cycle_id"]
          },
          {
            foreignKeyName: "daily_work_records_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_work_records_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      field_work_records: {
        Row: {
          created_at: string
          data: Json
          id: string
          notes: string | null
          property_id: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          notes?: string | null
          property_id?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          notes?: string | null
          property_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      field_work_sessions: {
        Row: {
          block_number: string
          created_at: string
          cycle_id: string | null
          id: string
          is_retroactive: boolean
          property_count: number
          retroactive_reason: string | null
          session_date: string
          status: string
          street_name: string
          updated_at: string
          user_id: string
          week_id: string | null
        }
        Insert: {
          block_number: string
          created_at?: string
          cycle_id?: string | null
          id?: string
          is_retroactive?: boolean
          property_count: number
          retroactive_reason?: string | null
          session_date?: string
          status?: string
          street_name: string
          updated_at?: string
          user_id: string
          week_id?: string | null
        }
        Update: {
          block_number?: string
          created_at?: string
          cycle_id?: string | null
          id?: string
          is_retroactive?: boolean
          property_count?: number
          retroactive_reason?: string | null
          session_date?: string
          status?: string
          street_name?: string
          updated_at?: string
          user_id?: string
          week_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_work_sessions_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycle_coverage_summary"
            referencedColumns: ["cycle_id"]
          },
          {
            foreignKeyName: "field_work_sessions_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_work_sessions_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      localities: {
        Row: {
          area_id: string
          id: string
          name: string
        }
        Insert: {
          area_id: string
          id?: string
          name: string
        }
        Update: {
          area_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "localities_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_records: {
        Row: {
          created_at: string
          data: Json
          entity_id: string
          entity_type: string
          id: string
          reason: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          entity_id: string
          entity_type: string
          id?: string
          reason: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          entity_id?: string
          entity_type?: string
          id?: string
          reason?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          coordinator_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          registration_number: string | null
          role: Database["public"]["Enums"]["user_role_type"]
          supervisor_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          coordinator_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean | null
          registration_number?: string | null
          role?: Database["public"]["Enums"]["user_role_type"]
          supervisor_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          coordinator_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          registration_number?: string | null
          role?: Database["public"]["Enums"]["user_role_type"]
          supervisor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_coordinator_id_fkey"
            columns: ["coordinator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          block_id: string | null
          block_number: string | null
          boletim_id: string | null
          complement: string | null
          container_count: number | null
          created_at: string
          geocoded_at: string | null
          geocoded_by: string | null
          had_previous_focus: boolean | null
          id: string
          inhabitants: number | null
          is_abandoned: boolean | null
          is_block_end: boolean | null
          is_frequently_closed: boolean | null
          latitude: number | null
          longitude: number | null
          neighborhood: string | null
          number: string
          observations: string | null
          reference: string | null
          sequence: number | null
          side: string | null
          status: Database["public"]["Enums"]["property_status"] | null
          street_id: string | null
          street_name: string | null
          type: Database["public"]["Enums"]["property_type"]
          user_id: string | null
        }
        Insert: {
          block_id?: string | null
          block_number?: string | null
          boletim_id?: string | null
          complement?: string | null
          container_count?: number | null
          created_at?: string
          geocoded_at?: string | null
          geocoded_by?: string | null
          had_previous_focus?: boolean | null
          id?: string
          inhabitants?: number | null
          is_abandoned?: boolean | null
          is_block_end?: boolean | null
          is_frequently_closed?: boolean | null
          latitude?: number | null
          longitude?: number | null
          neighborhood?: string | null
          number: string
          observations?: string | null
          reference?: string | null
          sequence?: number | null
          side?: string | null
          status?: Database["public"]["Enums"]["property_status"] | null
          street_id?: string | null
          street_name?: string | null
          type?: Database["public"]["Enums"]["property_type"]
          user_id?: string | null
        }
        Update: {
          block_id?: string | null
          block_number?: string | null
          boletim_id?: string | null
          complement?: string | null
          container_count?: number | null
          created_at?: string
          geocoded_at?: string | null
          geocoded_by?: string | null
          had_previous_focus?: boolean | null
          id?: string
          inhabitants?: number | null
          is_abandoned?: boolean | null
          is_block_end?: boolean | null
          is_frequently_closed?: boolean | null
          latitude?: number | null
          longitude?: number | null
          neighborhood?: string | null
          number?: string
          observations?: string | null
          reference?: string | null
          sequence?: number | null
          side?: string | null
          status?: Database["public"]["Enums"]["property_status"] | null
          street_id?: string | null
          street_name?: string | null
          type?: Database["public"]["Enums"]["property_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_boletim_id_fkey"
            columns: ["boletim_id"]
            isOneToOne: false
            referencedRelation: "boletins_rg"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_geocoded_by_fkey"
            columns: ["geocoded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_street_id_fkey"
            columns: ["street_id"]
            isOneToOne: false
            referencedRelation: "streets"
            referencedColumns: ["id"]
          },
        ]
      }
      property_pendencies: {
        Row: {
          agent_id: string
          attempt_count: number
          created_at: string
          current_status: Database["public"]["Enums"]["recovery_result"]
          id: string
          last_attempt_at: string | null
          property_id: string
          reason: string | null
          resolved_at: string | null
          resolved_status: Database["public"]["Enums"]["recovery_result"] | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          attempt_count?: number
          created_at?: string
          current_status: Database["public"]["Enums"]["recovery_result"]
          id?: string
          last_attempt_at?: string | null
          property_id: string
          reason?: string | null
          resolved_at?: string | null
          resolved_status?:
            | Database["public"]["Enums"]["recovery_result"]
            | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          attempt_count?: number
          created_at?: string
          current_status?: Database["public"]["Enums"]["recovery_result"]
          id?: string
          last_attempt_at?: string | null
          property_id?: string
          reason?: string | null
          resolved_at?: string | null
          resolved_status?:
            | Database["public"]["Enums"]["recovery_result"]
            | null
          updated_at?: string
        }
        Relationships: []
      }
      property_recovery_attempts: {
        Row: {
          agent_id: string
          attempt_number: number
          attempted_at: string
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          property_id: string
          result: Database["public"]["Enums"]["recovery_result"]
          visit_id: string | null
        }
        Insert: {
          agent_id: string
          attempt_number?: number
          attempted_at?: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          property_id: string
          result: Database["public"]["Enums"]["recovery_result"]
          visit_id?: string | null
        }
        Update: {
          agent_id?: string
          attempt_number?: number
          attempted_at?: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          property_id?: string
          result?: Database["public"]["Enums"]["recovery_result"]
          visit_id?: string | null
        }
        Relationships: []
      }
      rg_ocr_imports: {
        Row: {
          block_number: string | null
          created_at: string
          id: string
          image_url: string
          processed_data: Json | null
          raw_ocr_data: Json | null
          status: string | null
          street_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          block_number?: string | null
          created_at?: string
          id?: string
          image_url: string
          processed_data?: Json | null
          raw_ocr_data?: Json | null
          status?: string | null
          street_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          block_number?: string | null
          created_at?: string
          id?: string
          image_url?: string
          processed_data?: Json | null
          raw_ocr_data?: Json | null
          status?: string | null
          street_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rg_pdf_exports: {
        Row: {
          created_at: string | null
          filter_type: string
          filter_value: string | null
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          filter_type: string
          filter_value?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          filter_type?: string
          filter_value?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      rg_records: {
        Row: {
          created_at: string
          data: Json
          description: string | null
          id: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          description?: string | null
          id?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          description?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rg_uploads: {
        Row: {
          agent_id: string | null
          created_at: string | null
          extracted_data: Json | null
          id: string
          image_url: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          extracted_data?: Json | null
          id?: string
          image_url: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          extracted_data?: Json | null
          id?: string
          image_url?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      streets: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      subareas: {
        Row: {
          id: string
          locality_id: string
          name: string
        }
        Insert: {
          id?: string
          locality_id: string
          name: string
        }
        Update: {
          id?: string
          locality_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "subareas_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          brand: string | null
          color: string | null
          created_at: string
          id: string
          license_plate: string
          model: string | null
          observations: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          color?: string | null
          created_at?: string
          id?: string
          license_plate: string
          model?: string | null
          observations?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          brand?: string | null
          color?: string | null
          created_at?: string
          id?: string
          license_plate?: string
          model?: string | null
          observations?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      visit_deposits: {
        Row: {
          description: string | null
          id: string
          is_eliminated: boolean | null
          is_positive: boolean | null
          is_treated: boolean | null
          quantity: number | null
          type_code: string
          visit_id: string
        }
        Insert: {
          description?: string | null
          id?: string
          is_eliminated?: boolean | null
          is_positive?: boolean | null
          is_treated?: boolean | null
          quantity?: number | null
          type_code: string
          visit_id: string
        }
        Update: {
          description?: string | null
          id?: string
          is_eliminated?: boolean | null
          is_positive?: boolean | null
          is_treated?: boolean | null
          quantity?: number | null
          type_code?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_deposits_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          agent_id: string
          cycle_id: string
          elimination_amount: number | null
          elimination_done: boolean | null
          guidance_given: boolean | null
          has_focus: boolean | null
          id: string
          is_recovered: boolean | null
          larvicide_unit: string | null
          notes: string | null
          property_id: string
          sample_collected: boolean | null
          status: Database["public"]["Enums"]["visit_status"]
          treated_deposits: number | null
          treatment_amount: number | null
          treatment_applied: boolean | null
          tubitos_coletados: number | null
          visit_date: string
          week_id: string | null
          week_number: number | null
          year: number | null
        }
        Insert: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          agent_id: string
          cycle_id: string
          elimination_amount?: number | null
          elimination_done?: boolean | null
          guidance_given?: boolean | null
          has_focus?: boolean | null
          id?: string
          is_recovered?: boolean | null
          larvicide_unit?: string | null
          notes?: string | null
          property_id: string
          sample_collected?: boolean | null
          status: Database["public"]["Enums"]["visit_status"]
          treated_deposits?: number | null
          treatment_amount?: number | null
          treatment_applied?: boolean | null
          tubitos_coletados?: number | null
          visit_date?: string
          week_id?: string | null
          week_number?: number | null
          year?: number | null
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          agent_id?: string
          cycle_id?: string
          elimination_amount?: number | null
          elimination_done?: boolean | null
          guidance_given?: boolean | null
          has_focus?: boolean | null
          id?: string
          is_recovered?: boolean | null
          larvicide_unit?: string | null
          notes?: string | null
          property_id?: string
          sample_collected?: boolean | null
          status?: Database["public"]["Enums"]["visit_status"]
          treated_deposits?: number | null
          treatment_amount?: number | null
          treatment_applied?: boolean | null
          tubitos_coletados?: number | null
          visit_date?: string
          week_id?: string | null
          week_number?: number | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycle_coverage_summary"
            referencedColumns: ["cycle_id"]
          },
          {
            foreignKeyName: "visits_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_bulletins: {
        Row: {
          abandoned_count: number | null
          agent_id: string | null
          closed_count: number | null
          commerce_count: number | null
          completion_percentage: number | null
          created_at: string | null
          cycle_id: string | null
          deposits_eliminated: Json | null
          deposits_inspected: Json | null
          deposits_positive: Json | null
          deposits_treated: Json | null
          end_date: string
          focal_treatment_count: number | null
          id: string
          infestation_index: number | null
          informed_count: number | null
          insecticide_amount: number | null
          insecticide_type: string | null
          inspected_count: number | null
          other_type_count: number | null
          pdf_url: string | null
          perifocal_treatment_count: number | null
          positive_focus_count: number | null
          positive_property_count: number | null
          refused_count: number | null
          residence_count: number | null
          start_date: string
          status: string | null
          strategic_point_count: number | null
          territory_property_count: number | null
          updated_at: string | null
          vacant_lot_count: number | null
          visited_count: number | null
          week_number: number
          worked_property_count: number | null
        }
        Insert: {
          abandoned_count?: number | null
          agent_id?: string | null
          closed_count?: number | null
          commerce_count?: number | null
          completion_percentage?: number | null
          created_at?: string | null
          cycle_id?: string | null
          deposits_eliminated?: Json | null
          deposits_inspected?: Json | null
          deposits_positive?: Json | null
          deposits_treated?: Json | null
          end_date: string
          focal_treatment_count?: number | null
          id?: string
          infestation_index?: number | null
          informed_count?: number | null
          insecticide_amount?: number | null
          insecticide_type?: string | null
          inspected_count?: number | null
          other_type_count?: number | null
          pdf_url?: string | null
          perifocal_treatment_count?: number | null
          positive_focus_count?: number | null
          positive_property_count?: number | null
          refused_count?: number | null
          residence_count?: number | null
          start_date: string
          status?: string | null
          strategic_point_count?: number | null
          territory_property_count?: number | null
          updated_at?: string | null
          vacant_lot_count?: number | null
          visited_count?: number | null
          week_number: number
          worked_property_count?: number | null
        }
        Update: {
          abandoned_count?: number | null
          agent_id?: string | null
          closed_count?: number | null
          commerce_count?: number | null
          completion_percentage?: number | null
          created_at?: string | null
          cycle_id?: string | null
          deposits_eliminated?: Json | null
          deposits_inspected?: Json | null
          deposits_positive?: Json | null
          deposits_treated?: Json | null
          end_date?: string
          focal_treatment_count?: number | null
          id?: string
          infestation_index?: number | null
          informed_count?: number | null
          insecticide_amount?: number | null
          insecticide_type?: string | null
          inspected_count?: number | null
          other_type_count?: number | null
          pdf_url?: string | null
          perifocal_treatment_count?: number | null
          positive_focus_count?: number | null
          positive_property_count?: number | null
          refused_count?: number | null
          residence_count?: number | null
          start_date?: string
          status?: string | null
          strategic_point_count?: number | null
          territory_property_count?: number | null
          updated_at?: string | null
          vacant_lot_count?: number | null
          visited_count?: number | null
          week_number?: number
          worked_property_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_bulletins_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycle_coverage_summary"
            referencedColumns: ["cycle_id"]
          },
          {
            foreignKeyName: "weekly_bulletins_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      weeks: {
        Row: {
          created_at: string | null
          cycle_id: string
          end_date: string
          id: string
          number: number
          start_date: string
        }
        Insert: {
          created_at?: string | null
          cycle_id: string
          end_date: string
          id?: string
          number: number
          start_date: string
        }
        Update: {
          created_at?: string | null
          cycle_id?: string
          end_date?: string
          id?: string
          number?: number
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "weeks_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycle_coverage_summary"
            referencedColumns: ["cycle_id"]
          },
          {
            foreignKeyName: "weeks_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      annual_report_summary: {
        Row: {
          completed_cycles: number | null
          properties_worked: number | null
          total_cycles: number | null
          total_focus: number | null
          total_treatments: number | null
          total_visits: number | null
          year: number | null
        }
        Relationships: []
      }
      cycle_coverage_summary: {
        Row: {
          coverage_percentage: number | null
          cycle_id: string | null
          cycle_name: string | null
          total_properties: number | null
          worked_properties: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      agent_integrity_check: { Args: { _fix?: boolean }; Returns: Json }
      autoheal_agent: { Args: { _user_id: string }; Returns: string }
      can_supervise_user: { Args: { target_user_id: string }; Returns: boolean }
      check_block_completion: {
        Args: { p_block_id: string; p_cycle_id: string }
        Returns: undefined
      }
      cleanup_demo_data: { Args: never; Returns: Json }
      ensure_annual_cycles: {
        Args: { target_year: number }
        Returns: undefined
      }
      finalize_shift_pendencies: {
        Args: { p_agent_id: string; p_cycle_id: string; p_date: string }
        Returns: Json
      }
      get_epi_week: { Args: { d: string }; Returns: number }
      get_user_role: { Args: { u_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      sync_cycle_statuses: { Args: never; Returns: Json }
    }
    Enums: {
      activity_type: "routine" | "infestation_survey" | "pending"
      app_role:
        | "admin"
        | "supervisor"
        | "agent"
        | "admin_master"
        | "coordenador"
        | "agente"
      block_status: "not_started" | "in_progress" | "completed"
      cycle_status: "not_started" | "in_progress" | "finished"
      property_status:
        | "active"
        | "pending"
        | "deactivated"
        | "absent"
        | "not_located"
        | "unoccupied"
        | "demolished"
        | "visited"
      property_type:
        | "residence"
        | "commerce"
        | "vacant_lot"
        | "strategic_point"
        | "others"
      recovery_result:
        | "closed"
        | "refused"
        | "absent"
        | "not_located"
        | "not_done"
        | "visited"
        | "unoccupied"
        | "demolished"
      user_role_type: "admin_master" | "coordenador" | "supervisor" | "agente"
      visit_status: "visited" | "closed" | "refused" | "abandoned"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_type: ["routine", "infestation_survey", "pending"],
      app_role: [
        "admin",
        "supervisor",
        "agent",
        "admin_master",
        "coordenador",
        "agente",
      ],
      block_status: ["not_started", "in_progress", "completed"],
      cycle_status: ["not_started", "in_progress", "finished"],
      property_status: [
        "active",
        "pending",
        "deactivated",
        "absent",
        "not_located",
        "unoccupied",
        "demolished",
        "visited",
      ],
      property_type: [
        "residence",
        "commerce",
        "vacant_lot",
        "strategic_point",
        "others",
      ],
      recovery_result: [
        "closed",
        "refused",
        "absent",
        "not_located",
        "not_done",
        "visited",
        "unoccupied",
        "demolished",
      ],
      user_role_type: ["admin_master", "coordenador", "supervisor", "agente"],
      visit_status: ["visited", "closed", "refused", "abandoned"],
    },
  },
} as const
