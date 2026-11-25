// Tipos escritos A MANO, coherentes con supabase/migrations/ (TASK-006). Se sustituiran por los
// generados con `supabase gen types typescript --local` cuando la CLI este disponible.
// Los tipos no reflejan GRANT/RLS: columnas como id, organization_id, created_at y updated_at
// no son escribibles por usuarios autenticados aunque aparezcan en Insert/Update.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          organization_id: string;
          user_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role: string;
          created_at?: string;
        };
        Update: {
          organization_id?: string;
          user_id?: string;
          role?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'memberships_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      customers: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          email: string | null;
          phone: string | null;
          notes: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'customers_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      technicians: {
        Row: {
          id: string;
          organization_id: string;
          full_name: string;
          email: string | null;
          phone: string | null;
          notes: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          full_name?: string;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'technicians_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      activity_events: {
        Row: {
          id: string;
          organization_id: string;
          actor_id: string;
          entity_type: 'customer' | 'technician';
          entity_id: string;
          action: 'archived' | 'restored';
          occurred_at: string;
          // Orden de insercion asignado por la BD (A02-05). Nulo en los eventos historicos
          // anteriores a la migracion: su orden relativo no es reconstruible y no se inventa.
          seq: number | null;
        };
        // Solo lectura para usuarios (sin GRANT de escritura): los eventos los escribe el trigger.
        Insert: {
          id?: string;
          organization_id: string;
          actor_id: string;
          entity_type: 'customer' | 'technician';
          entity_id: string;
          action: 'archived' | 'restored';
          occurred_at?: string;
          seq?: never; // no escribible por usuarios (sin GRANT): lo asigna la BD
        };
        Update: {
          id?: string;
          organization_id?: string;
          actor_id?: string;
          entity_type?: 'customer' | 'technician';
          entity_id?: string;
          action?: 'archived' | 'restored';
          occurred_at?: string;
          seq?: never;
        };
        Relationships: [
          {
            foreignKeyName: 'activity_events_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
