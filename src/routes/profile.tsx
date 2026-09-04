import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Camera, CreditCard, LayoutDashboard, LogOut, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createWorker } from "tesseract.js";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { analyzeCardCapture, patchMyProfile } from "@/lib/api/http-client";
import { useAuth } from "@/lib/auth";
import { compressDataUrl } from "@/lib/domain/capture/card-image-store";
import { parseBusinessCardText } from "@/lib/domain/capture/parse-ocr";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — FUNNEL by Conninter" },
      {
        name: "description",
        content: "Edit your FUNNEL booth profile and sign out.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { session, setSession, logout } = useAuth();
  const navigate = useNavigate();
  const { seedSource, lastSyncError } = useStore();
  const user = session?.user;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [designation, setDesignation] = useState("");
  const [mobile, setMobile] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
    setCompany(user.company ?? "");
    setDesignation(user.designation ?? "");
    setMobile(user.mobile ?? "");
  }, [user]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraOn || !video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => toast.error("Could not start camera"));
    return () => {
      video.srcObject = null;
    };
  }, [cameraOn]);

  const applyCardFields = (fields: {
    name?: string;
    company?: string;
    designation?: string;
    mobile?: string;
    email?: string;
  }) => {
    if (fields.name?.trim()) setName(fields.name.trim());
    if (fields.company?.trim()) setCompany(fields.company.trim());
    if (fields.designation?.trim()) setDesignation(fields.designation.trim());
    if (fields.mobile?.trim()) setMobile(fields.mobile.trim());
    if (fields.email?.trim()) setEmail(fields.email.trim());
    setEditing(true);
    toast.success("Card details filled — review and save");
  };

  const processImage = async (dataUrl: string) => {
    setScanning(true);
    try {
      const compressed = await compressDataUrl(dataUrl);
      const worker = await createWorker("eng");
      const result = await worker.recognize(compressed);
      await worker.terminate();
      const text = result.data.text || "";
      const parsed = parseBusinessCardText(text);
      let fields = {
        name: parsed.lead.name,
        company: parsed.lead.company,
        designation: parsed.lead.designation,
        mobile: parsed.lead.mobile,
        email: parsed.lead.email,
      };
      try {
        const base64 = compressed.includes(",") ? compressed.split(",")[1]! : compressed;
        const ai = await analyzeCardCapture({
          imageBase64: base64,
          mimeType: "image/jpeg",
          ocrText: text,
        });
        if (ai.ok && ai.fields) {
          fields = {
            name: ai.fields.name || fields.name,
            company: ai.fields.company || fields.company,
            designation: ai.fields.designation || fields.designation,
            mobile: ai.fields.mobile || fields.mobile,
            email: ai.fields.email || fields.email,
          };
        }
      } catch {
        /* local OCR is enough */
      }
      applyCardFields(fields);
      stopCamera();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not read the card");
    } finally {
      setScanning(false);
    }
  };

  const startCamera = async () => {
    stopCamera();
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      setCameraOn(true);
    } catch {
      toast.error("Camera permission denied");
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    void processImage(canvas.toDataURL("image/jpeg", 0.92));
  };

  const save = async () => {
    setBusy(true);
    try {
      const body: {
        name: string;
        email: string;
        company: string;
        designation: string;
        mobile: string;
        loginPin?: string;
      } = { name, email, company, designation, mobile };
      if (pin.trim()) body.loginPin = pin.trim();
      const next = await patchMyProfile(body);
      setSession(next);
      setPin("");
      setEditing(false);
      toast.success("Profile updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Profile" subtitle="Your booth account">
      <section className="rounded-xl border border-border bg-card p-4 shadow-card">
        {user && !editing ? (
          <>
            <p className="text-lg font-semibold text-foreground">{user.name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{user.email}</p>
            {user.company || user.designation || user.mobile ? (
              <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                {user.company ? <p>{user.company}</p> : null}
                {user.designation ? <p>{user.designation}</p> : null}
                {user.mobile ? <p>{user.mobile}</p> : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-warning-foreground">
                Add company and mobile so visitors see a complete card.
              </p>
            )}
            <span
              className={cn(
                "mt-3 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold",
                user.role === "Admin" ? "bg-accent-soft text-accent" : "bg-primary-soft text-primary",
              )}
            >
              {user.role}
            </span>
            <Button
              type="button"
              variant="outline"
              className="mt-4 h-11 w-full rounded-xl"
              onClick={() => setEditing(true)}
            >
              Edit profile
            </Button>
          </>
        ) : null}

        {user && editing ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Edit profile</h2>
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Name</Label>
              <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-company">Company</Label>
              <Input
                id="profile-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-designation">Designation</Label>
              <Input
                id="profile-designation"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-mobile">Mobile</Label>
              <Input
                id="profile-mobile"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-pin">New 4-digit PIN (optional)</Label>
              <Input
                id="profile-pin"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="h-11 rounded-xl"
                placeholder="Leave blank to keep current PIN"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="h-11 flex-1 rounded-xl" disabled={busy} onClick={() => void save()}>
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 rounded-xl"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setPin("");
                  if (user) {
                    setName(user.name);
                    setEmail(user.email);
                    setCompany(user.company ?? "");
                    setDesignation(user.designation ?? "");
                    setMobile(user.mobile ?? "");
                  }
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-dashed border-border p-3">
          <p className="text-sm font-semibold text-foreground">Scan my visiting card</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Autofill name, company, designation, mobile, and email from your card.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl"
              disabled={scanning}
              onClick={() => void startCamera()}
            >
              <Camera className="size-4" />
              Camera
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl"
              disabled={scanning}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4" />
              Upload
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === "string") void processImage(reader.result);
              };
              reader.readAsDataURL(file);
            }}
          />
          {scanning ? <p className="mt-2 text-xs text-muted-foreground">Reading card…</p> : null}
          {cameraOn ? (
            <div className="mt-3 space-y-2">
              <video ref={videoRef} playsInline muted className="w-full rounded-xl bg-black" />
              <div className="flex gap-2">
                <Button className="h-10 flex-1 rounded-xl" onClick={captureFrame} disabled={scanning}>
                  Capture
                </Button>
                <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={stopCamera}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <Button asChild variant="outline" className="mt-3 h-11 w-full rounded-xl">
          <Link to="/card">
            <CreditCard className="size-4" />
            My card & QR
          </Link>
        </Button>

        {user?.role === "Admin" ? (
          <Button asChild className="mt-3 h-11 w-full rounded-xl">
            <Link to="/admin">
              <LayoutDashboard className="size-4" />
              Open admin dashboard
            </Link>
          </Button>
        ) : null}

        <Button
          type="button"
          variant="outline"
          className="mt-3 h-11 w-full rounded-xl"
          onClick={() => {
            logout();
            void navigate({ to: "/" });
          }}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold text-foreground">Connection</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          {seedSource === "loading" && "Connecting…"}
          {seedSource === "api" &&
            "Online. Saves upload immediately; pending leads sync on reconnect or via Sync."}
          {seedSource === "error" && "Could not reach the server. Check your connection and try again."}
        </p>
        {lastSyncError ? (
          <p className="mt-2 text-xs text-destructive">Last sync issue: something went wrong. Try Sync again.</p>
        ) : null}
      </section>
    </AppShell>
  );
}
