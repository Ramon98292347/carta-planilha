import { useEffect, useMemo, useState } from "react";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

type Announcement = {
  id: string;
  title: string;
  subtitle?: string | null;
  type: "image" | "video" | "text";
  media_url?: string | null;
  video_url?: string | null;
  link_url?: string | null;
};

type ClientInfo = {
  id: string;
  church_name?: string | null;
  pastor_name?: string | null;
};

const DEFAULT_VIDEO_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const DEFAULT_IMAGE_URL = "/app-icon.svg";

const DEFAULT_SLIDES: Announcement[] = [
  {
    id: "default-info",
    title: "Informativo da Igreja",
    subtitle: "Digite o TOTVS para carregar os comunicados oficiais.",
    type: "text",
  },
  {
    id: "default-video",
    title: "Vídeo em destaque",
    subtitle: "Assista aos comunicados da semana.",
    type: "video",
    video_url: DEFAULT_VIDEO_URL,
  },
  {
    id: "default-image",
    title: "Avisos importantes",
    subtitle: "Fique atento às datas e eventos.",
    type: "image",
    media_url: DEFAULT_IMAGE_URL,
  },
];

const isVideoEmbed = (url: string) => /youtube\.com|youtu\.be|drive\.google\.com/.test(url);

const buildEmbedUrl = (url: string) => {
  if (url.includes("youtu.be/")) {
    const id = url.split("youtu.be/")[1]?.split(/[?&]/)[0];
    return id ? `https://www.youtube.com/embed/${id}` : url;
  }
  if (url.includes("youtube.com/watch")) {
    const params = new URL(url).searchParams;
    const id = params.get("v");
    return id ? `https://www.youtube.com/embed/${id}` : url;
  }
  if (url.includes("drive.google.com")) {
    return url.replace("/view", "/preview");
  }
  return url;
};

export function LoginCarousel({ totvsId }: { totvsId: string }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>(DEFAULT_SLIDES);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [carouselApi, setCarouselApi] = useState<import("@/components/ui/carousel").CarouselApi | null>(null);
  const [lastTotvs, setLastTotvs] = useState("");

  useEffect(() => {
    const value = (totvsId || "").trim();
    if (!value) {
      setAnnouncements(DEFAULT_SLIDES);
      setClient(null);
      setLastTotvs("");
      return;
    }

    const handle = window.setTimeout(async () => {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
      setLoading(true);
      setLastTotvs(value);
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/public-announcements?totvs=${encodeURIComponent(value)}`, {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        });
        const payload = (await response.json().catch(() => null)) as
          | null
          | { ok: boolean; client?: ClientInfo | null; announcements?: Announcement[] };

        if (!response.ok || !payload?.ok) {
          setAnnouncements(DEFAULT_SLIDES);
          setClient(null);
          return;
        }

        const base = payload.announcements && payload.announcements.length > 0 ? payload.announcements : [];
        const clientInfo = payload.client || null;
        if (!clientInfo) {
          setAnnouncements([
            {
              id: "totvs-not-found",
              title: "TOTVS não encontrado",
              subtitle: `TOTVS: ${value}. Procure o pastor responsável.`,
              type: "text",
            },
          ]);
          setClient(null);
          return;
        }
        const withInfo: Announcement[] = [];

        const birthdaySlide = base.find((item) => item.id === "birthday-slide");
        const birthdayText = birthdaySlide?.subtitle ? `\n\nAniversariantes:\n${birthdaySlide.subtitle}` : "";
        withInfo.push({
          id: "info-slide",
          title: "Informativo da Igreja",
          subtitle: clientInfo?.church_name
            ? `Igreja: ${clientInfo.church_name}\nPastor: ${clientInfo.pastor_name || "—"}${birthdayText}`
            : `Informações e avisos da igreja.${birthdayText}`,
          type: "text",
        });

        const videoSlide = base.find((item) => item.type === "video") || {
          id: "default-video",
          title: "Vídeo em destaque",
          subtitle: "Assista aos comunicados da semana.",
          type: "video",
          video_url: DEFAULT_VIDEO_URL,
        };

        const imageSlide = base.find((item) => item.type === "image") || {
          id: "default-image",
          title: "Avisos importantes",
          subtitle: "Fique atento às datas e eventos.",
          type: "image",
          media_url: DEFAULT_IMAGE_URL,
        };

        const remaining = base.filter((item) => item.id !== birthdaySlide?.id && item.type === "text");

        const list = [withInfo[0], videoSlide, imageSlide, ...remaining].filter(Boolean) as Announcement[];
        setAnnouncements(list.length > 0 ? list : DEFAULT_SLIDES);
        setClient(clientInfo);
      } catch {
        setAnnouncements(DEFAULT_SLIDES);
        setClient(null);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => window.clearTimeout(handle);
  }, [totvsId]);

  useEffect(() => {
    if (!carouselApi) return;
    const onSelect = () => setActiveIndex(carouselApi.selectedScrollSnap());
    carouselApi.on("select", onSelect);
    onSelect();
    return () => {
      carouselApi.off("select", onSelect);
    };
  }, [carouselApi]);

  useEffect(() => {
    if (!carouselApi) return;
    if (paused) return;
    const interval = window.setInterval(() => {
      carouselApi.scrollNext();
    }, 7000);
    return () => window.clearInterval(interval);
  }, [carouselApi, paused]);

  const slides = useMemo(() => announcements.slice(0, 10), [announcements]);

  return (
    <div
      className="rounded-lg border bg-card p-4 shadow-sm md:h-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Divulgação</h3>
          <p className="text-xs text-muted-foreground">
            {client?.church_name ? `Igreja: ${client.church_name}` : lastTotvs ? `TOTVS: ${lastTotvs}` : "Carrossel informativo"}
          </p>
        </div>
        {loading && <span className="text-xs text-muted-foreground">Atualizando...</span>}
      </div>

      <Carousel setApi={setCarouselApi} opts={{ loop: true }}>
        <CarouselContent className="gap-4">
          {slides.map((item) => (
            <CarouselItem key={item.id} className="basis-full md:basis-1/3">
              <div className="relative flex min-h-[560px] flex-col justify-between overflow-hidden rounded-md border bg-background md:min-h-[530px]">
                {item.type === "image" && item.media_url ? (
                  <div className="absolute inset-0">
                    <img src={item.media_url} alt={item.title} className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-black/45" />
                  </div>
                ) : null}

                <div className={cn("relative z-10 flex h-full flex-col justify-between p-4", item.type === "image" ? "text-white" : "text-foreground")}>
                  <div className="space-y-2">
                    <h4 className="text-base font-semibold">{item.title}</h4>
                    {item.subtitle ? (
                      <div className="space-y-1 text-sm opacity-90">
                        {item.subtitle.split("\n").map((line, idx) => (
                          <p key={`${item.id}-line-${idx}`}>{line}</p>
                        ))}
                      </div>
                    ) : null}
                    {item.type === "video" && item.video_url ? (
                      <div className="mt-2 overflow-hidden rounded-md border bg-black/5">
                        {isVideoEmbed(item.video_url) ? (
                          <iframe
                            title={item.title}
                            src={buildEmbedUrl(item.video_url)}
                            className="h-40 w-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        ) : (
                          <video src={item.video_url} controls className="h-40 w-full bg-black" />
                        )}
                      </div>
                    ) : null}
                  </div>

                  {item.link_url ? (
                    <div className="pt-3">
                      <Button asChild size="sm" variant={item.type === "image" ? "secondary" : "default"}>
                        <a href={item.link_url} target="_blank" rel="noopener noreferrer">
                          Saiba mais
                        </a>
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      <div className="mt-3 flex items-center justify-center gap-2">
        {slides.map((_, idx) => (
          <button
            key={`dot-${idx}`}
            type="button"
            onClick={() => carouselApi?.scrollTo(idx)}
            className={cn(
              "h-2.5 w-2.5 rounded-full border",
              idx === activeIndex ? "bg-primary border-primary" : "bg-muted border-muted-foreground/40",
            )}
            aria-label={`Ir para slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
