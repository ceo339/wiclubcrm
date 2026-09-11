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
      comments: {
        Row: {
          author: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          partner_id: string
          text: string
        }
        Insert: {
          author?: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          partner_id: string
          text: string
        }
        Update: {
          author?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          partner_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaign_recipients: {
        Row: {
          campaign_id: string
          clicked_at: string | null
          created_at: string
          email: string
          entity_id: string
          entity_type: string
          error: string | null
          id: string
          opened_at: string | null
          partner_id: string
          resend_message_id: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          clicked_at?: string | null
          created_at?: string
          email: string
          entity_id: string
          entity_type: string
          error?: string | null
          id?: string
          opened_at?: string | null
          partner_id: string
          resend_message_id?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          clicked_at?: string | null
          created_at?: string
          email?: string
          entity_id?: string
          entity_type?: string
          error?: string | null
          id?: string
          opened_at?: string | null
          partner_id?: string
          resend_message_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaign_recipients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          audience: string
          body: string
          created_at: string
          created_by: string | null
          id: string
          partner_id: string
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          audience: string
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          partner_id: string
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          partner_id?: string
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          added_date: string
          age: number
          birthday: string | null
          city: string | null
          cohort_start_date: string | null
          country: string | null
          created_at: string
          decline_note: string | null
          decline_reason: string | null
          email: string | null
          id: string
          name: string
          note: string | null
          partner_id: string
          phone: string | null
          plan: string | null
          product_id: string | null
          source: string | null
          stage: string
          updated_at: string
          value: number
        }
        Insert: {
          added_date?: string
          age?: number
          birthday?: string | null
          city?: string | null
          cohort_start_date?: string | null
          country?: string | null
          created_at?: string
          decline_note?: string | null
          decline_reason?: string | null
          email?: string | null
          id?: string
          name: string
          note?: string | null
          partner_id: string
          phone?: string | null
          plan?: string | null
          product_id?: string | null
          source?: string | null
          stage?: string
          updated_at?: string
          value?: number
        }
        Update: {
          added_date?: string
          age?: number
          birthday?: string | null
          city?: string | null
          cohort_start_date?: string | null
          country?: string | null
          created_at?: string
          decline_note?: string | null
          decline_reason?: string | null
          email?: string | null
          id?: string
          name?: string
          note?: string | null
          partner_id?: string
          phone?: string | null
          plan?: string | null
          product_id?: string | null
          source?: string | null
          stage?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "leads_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      member_enrollments: {
        Row: {
          attended: Json
          created_at: string
          id: string
          member_id: string
          paid: boolean
          partner_id: string
          price: number
          product_id: string | null
          start_date: string | null
          status: string
        }
        Insert: {
          attended?: Json
          created_at?: string
          id?: string
          member_id: string
          paid?: boolean
          partner_id: string
          price?: number
          product_id?: string | null
          start_date?: string | null
          status?: string
        }
        Update: {
          attended?: Json
          created_at?: string
          id?: string
          member_id?: string
          paid?: boolean
          partner_id?: string
          price?: number
          product_id?: string | null
          start_date?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_enrollments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_enrollments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_enrollments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          birthday: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          lead_id: string | null
          member_since: string | null
          name: string
          partner_id: string
          phone: string | null
        }
        Insert: {
          birthday?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_id?: string | null
          member_since?: string | null
          name: string
          partner_id: string
          phone?: string | null
        }
        Update: {
          birthday?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_id?: string | null
          member_since?: string | null
          name?: string
          partner_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          id: string
          name: string
          reply_to_email: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name: string
          reply_to_email?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          reply_to_email?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          enrollment_id: string | null
          id: string
          lead_id: string | null
          member_id: string | null
          paid_date: string
          partner_id: string
          product_id: string | null
          status: string | null
          stripe_checkout_session_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          enrollment_id?: string | null
          id?: string
          lead_id?: string | null
          member_id?: string | null
          paid_date?: string
          partner_id: string
          product_id?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          enrollment_id?: string | null
          id?: string
          lead_id?: string | null
          member_id?: string | null
          paid_date?: string
          partner_id?: string
          product_id?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "member_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_cohorts: {
        Row: {
          id: string
          partner_id: string
          product_id: string
          start_date: string
        }
        Insert: {
          id?: string
          partner_id: string
          product_id: string
          start_date: string
        }
        Update: {
          id?: string
          partner_id?: string
          product_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_cohorts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_cohorts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          id: string
          name: string
          partner_id: string
          price: number
          sessions: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          partner_id: string
          price?: number
          sessions?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          partner_id?: string
          price?: number
          sessions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          partner_id: string | null
          role: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          partner_id?: string | null
          role?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          partner_id?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_plans: {
        Row: {
          amount: number
          id: string
          month: string
          partner_id: string
        }
        Insert: {
          amount?: number
          id?: string
          month: string
          partner_id: string
        }
        Update: {
          amount?: number
          id?: string
          month?: string
          partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_plans_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          done: boolean
          due_date: string | null
          entity_id: string
          entity_type: string
          id: string
          partner_id: string
          text: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          due_date?: string | null
          entity_id: string
          entity_type: string
          id?: string
          partner_id: string
          text: string
        }
        Update: {
          created_at?: string
          done?: boolean
          due_date?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          partner_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_partner_id: { Args: never; Returns: string }
      is_hq: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
