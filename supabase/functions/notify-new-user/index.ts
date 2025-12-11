import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NewUserNotification {
  email: string;
  full_name: string;
}

// HTML escape function to prevent XSS/injection
const escapeHtml = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// Validate email format
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, full_name }: NewUserNotification = await req.json();
    
    // Input validation
    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      throw new Error("Invalid email format");
    }
    
    // Limit field lengths
    const sanitizedEmail = escapeHtml(email.slice(0, 255));
    const sanitizedFullName = escapeHtml((full_name || '').slice(0, 100));
    
    console.log(`Sending notification for new user: ${sanitizedEmail}`);

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const adminEmail = "antonifornes@gmail.com";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Portflow <onboarding@resend.dev>",
        to: [adminEmail],
        subject: `Nuevo usuario pendiente de aprobación: ${sanitizedEmail}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a2e; border-bottom: 2px solid #4f46e5; padding-bottom: 10px;">
              Nuevo Usuario Registrado
            </h1>
            
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Nombre:</strong> ${sanitizedFullName || 'No especificado'}</p>
              <p style="margin: 0 0 10px 0;"><strong>Email:</strong> ${sanitizedEmail}</p>
              <p style="margin: 0;"><strong>Fecha:</strong> ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</p>
            </div>
            
            <p style="color: #4b5563;">
              Un nuevo usuario ha intentado acceder a la aplicación y está pendiente de tu aprobación.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://portflow-vision.lovable.app/admin" 
                 style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Ir al Panel de Administración
              </a>
            </div>
            
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              Este email fue enviado automáticamente desde Portflow.
            </p>
          </div>
        `,
      }),
    });

    const data = await res.json();
    console.log("Email sent successfully:", data);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
