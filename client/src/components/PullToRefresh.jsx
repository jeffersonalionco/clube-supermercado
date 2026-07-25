import { usePullToRefresh } from "../hooks/usePullToRefresh.js";

export default function PullToRefresh({
  onRefresh,
  disabled = false,
  children,
  className = "",
}) {
  const { pullY, refreshing, ready, handlers } = usePullToRefresh(onRefresh, {
    disabled,
  });

  return (
    <div
      className={`ptr-wrap ${className}`.trim()}
      {...handlers}
    >
      <div
        className={`ptr-indicator${refreshing ? " ptr-indicator--refreshing" : ""}${ready ? " ptr-indicator--ready" : ""}`}
        style={{
          height: pullY > 0 || refreshing ? `${Math.max(pullY, refreshing ? 48 : 0)}px` : 0,
          opacity: pullY > 8 || refreshing ? 1 : 0,
        }}
        aria-hidden={!refreshing && pullY < 8}
      >
        <span className={`ptr-indicator__spinner${refreshing ? " ptr-indicator__spinner--on" : ""}`} />
        <span className="ptr-indicator__text">
          {refreshing ? "Atualizando…" : ready ? "Solte para atualizar" : "Puxe para atualizar"}
        </span>
      </div>
      {children}
    </div>
  );
}
