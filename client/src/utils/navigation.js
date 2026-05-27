export const APP_VIEWS = ["home", "compras", "perfil", "contato", "editar"];

const APP_HISTORY_KEY = "superama";

export function viewFromLocation() {
  const hash = window.location.hash.slice(1).replace(/^\//, "").trim();
  const view = hash || "home";
  return APP_VIEWS.includes(view) ? view : "home";
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
