import { supabase } from "@/lib/supabase";

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY || "").trim();

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
};

export const canUsePush = () =>
  "Notification" in window && "serviceWorker" in navigator && "PushManager" in window && !!VAPID_PUBLIC_KEY;

export const getPushPermission = () => ("Notification" in window ? Notification.permission : "denied");

export const getCurrentSubscription = async () => {
  if (!canUsePush()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
};

export const subscribeToPush = async () => {
  if (!canUsePush()) return { ok: false, reason: "unsupported" } as const;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" } as const;

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const subscription =
    existing ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const { error } = await supabase.functions.invoke("push-subscribe", {
    body: { subscription },
  });

  if (error) return { ok: false, reason: "server" } as const;
  return { ok: true } as const;
};

export const sendTestNotification = async () => {
  if (!canUsePush()) return { ok: false, reason: "unsupported" } as const;
  if (Notification.permission !== "granted") return { ok: false, reason: "denied" } as const;
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification("Teste de notificacao", {
    body: "Se voce recebeu isso, o push esta ativo.",
    icon: "/app-icon.svg",
    badge: "/app-icon.svg",
    data: { url: "/" },
  });
  return { ok: true } as const;
};
