export const TAB_VIEWS = ["home", "compras", "pontos", "premios"];
export const APP_VIEWS = [...TAB_VIEWS, "perfil", "contato", "editar"];
export const PUBLIC_VIEWS = ["regulamento", "privacidade"];
export const ALL_VIEWS = [...APP_VIEWS, ...PUBLIC_VIEWS];

const APP_HISTORY_KEY = "superama";

export function viewFromLocation() {
  const hash = window.location.hash.slice(1).replace(/^\//, "").trim();
  const view = hash || "home";
  return ALL_VIEWS.includes(view) ? view : "home";
}

export function urlForView(view) {
  return view === "home" ? "#/" : `#/${view}`;
}

export function pushView(view) {
  history.pushState({ view, app: APP_HISTORY_KEY }, "", urlForView(view));
}

export function replaceView(view) {
  history.replaceState({ view, app: APP_HISTORY_KEY }, "", urlForView(view));
}

export function isAppHistoryState(state) {
  return state?.app === APP_HISTORY_KEY;
}

/** Garante entrada "home" antes da tela atual (evita sair do site no primeiro voltar). */
export function seedHistoryStack(view) {
  replaceView("home");
  if (view !== "home") {
    pushView(view);
  }
}
