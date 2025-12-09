import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DeleteUserRequest {
  user_id: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the requesting user is a super admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Create client with user's token to verify identity
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: requestingUser }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !requestingUser) {
      throw new Error("Unauthorized");
    }

    // Check if requesting user is super admin
    const SUPER_ADMIN_EMAIL = "antonifornes@gmail.com";
    if (requestingUser.email !== SUPER_ADMIN_EMAIL) {
      throw new Error("Only super admin can delete users");
    }

    const { user_id }: DeleteUserRequest = await req.json();
    if (!user_id) {
      throw new Error("user_id is required");
    }

    console.log(`Super admin ${requestingUser.email} is deleting user: ${user_id}`);

    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get user info before deletion for logging
    const { data: userToDelete } = await supabaseAdmin.auth.admin.getUserById(user_id);
    console.log(`Deleting user: ${userToDelete?.user?.email}`);

    // Delete avatar from storage if exists
    const { data: avatarFiles } = await supabaseAdmin.storage
      .from("avatars")
      .list(user_id);
    
    if (avatarFiles && avatarFiles.length > 0) {
      const filesToDelete = avatarFiles.map(f => `${user_id}/${f.name}`);
      await supabaseAdmin.storage.from("avatars").remove(filesToDelete);
      console.log(`Deleted avatar files for user ${user_id}`);
    }

    // Delete user roles
    await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
    console.log(`Deleted user roles for ${user_id}`);

    // Delete profile
    await supabaseAdmin.from("profiles").delete().eq("user_id", user_id);
    console.log(`Deleted profile for ${user_id}`);

    // Delete user from auth.users
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
    if (deleteError) {
      throw deleteError;
    }

    console.log(`Successfully deleted user ${user_id} from auth.users`);

    return new Response(
      JSON.stringify({ success: true, message: "User deleted successfully" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error deleting user:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: error.message === "Unauthorized" || error.message === "Only super admin can delete users" ? 403 : 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
