import { useEffect, useRef, type RefObject } from "react";

export interface VideoPlayer {
  getCurrentTime(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo?(): void;
  destroy(): void;
  getIframe(): HTMLIFrameElement;
}
interface YouTubeAPI {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      width: string;
      height: string;
      host: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: (event: { target: VideoPlayer }) => void;
        onError: () => void;
      };
    },
  ) => VideoPlayer;
}
declare global {
  interface Window {
    YT?: YouTubeAPI;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let loading: Promise<YouTubeAPI> | undefined;
function loadAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;
  loading = new Promise<YouTubeAPI>((resolve, reject) => {
    let script = document.getElementById(
      "hack-youtube-api",
    ) as HTMLScriptElement | null;
    const timeout = window.setTimeout(() => {
      loading = undefined;
      script?.remove();
      reject(new Error("YouTube player did not load"));
    }, 15000);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) {
        clearTimeout(timeout);
        resolve(window.YT);
      }
    };
    if (!script) {
      script = document.createElement("script");
      script.id = "hack-youtube-api";
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        clearTimeout(timeout);
        loading = undefined;
        script?.remove();
        reject(new Error("YouTube could not be reached"));
      };
      document.head.append(script);
    }
  });
  return loading;
}
export function YouTubePlayer({
  id,
  online,
  initialTime,
  player,
  onStatus,
}: {
  id: string;
  online: boolean;
  initialTime: number;
  player: RefObject<VideoPlayer | null>;
  onStatus: (state: "loading" | "ready" | "unavailable") => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!online) return;
    let disposed = false;
    let instance: VideoPlayer | undefined;
    onStatus("loading");
    loadAPI()
      .then((api) => {
        if (disposed || !host.current) return;
        const mount = document.createElement("div");
        host.current.replaceChildren(mount);
        instance = new api.Player(mount, {
          videoId: id,
          width: "100%",
          height: "100%",
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            origin: window.location.origin,
            playsinline: 1,
            rel: 0,
            start: initialTime,
          },
          events: {
            onReady: ({ target }) => {
              if (disposed) return;
              target.getIframe().title = "Game video";
              player.current = target;
              onStatus("ready");
            },
            onError: () => {
              if (!disposed) {
                player.current = null;
                onStatus("unavailable");
              }
            },
          },
        });
      })
      .catch(() => {
        if (!disposed) onStatus("unavailable");
      });
    return () => {
      disposed = true;
      player.current = null;
      instance?.destroy();
      host.current?.replaceChildren();
    };
    // Keep the same player while moving between shots; only changing the game
    // video or connectivity should create a new iframe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, online, player, onStatus]);
  return <div className="youtube-host" ref={host} />;
}
