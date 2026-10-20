/**
 * The Customization Center settings page.
 *
 * Rendered inside its own `settings.section` nav entry (not inside General).
 * It is a thin view over the imperative {@link SkinController}: it subscribes
 * to the controller snapshot with `useSyncExternalStore` and calls actions on
 * click. File decoding is delegated to the wallpaper runtime.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { SkinController } from "./controller.ts";
import { LibraryPicker } from "./LibraryPicker.tsx";
import { TuningPanel } from "./TuningPanel.tsx";
import type { SectionProps } from "./dsh-env.ts";

/** Props: the composed slot props plus the shared controller. */
export type CustomCenterPageProps = SectionProps & {
  controller: SkinController;
};

/** The settings-section page component. */
export function CustomCenterPage(props: CustomCenterPageProps): JSX.Element {
  const { controller } = props;
  const snap = useSyncExternalStore(
    useCallback((cb: () => void) => controller.subscribe(cb), [controller]),
    () => controller.getSnapshot(),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tab, setTab] = useState<"appearance" | "tuning">("appearance");
  // left and right veil move together; starts on when they already match
  const [linked, setLinked] = useState(snap.sideOpacity === snap.bgOpacity);
  const hasWallpaper = snap.kind !== "none";
  const status = snap.previewing
    ? "预览中：更改已实时生效，尚未保存"
    : snap.dirty
      ? "有未保存的更改"
      : "所有更改已保存";
  const statusTone = snap.previewing
    ? "preview"
    : snap.dirty
      ? "dirty"
      : "clean";
  const seeds = snap.seeds;

  // A video thumbnail needs its own object URL, released when the draft changes.
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!snap.video) {
      setVideoUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(snap.video);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [snap.video]);

  const stageStyle =
    snap.kind === "image" && snap.image
      ? { backgroundImage: `url("${snap.image}")` }
      : snap.kind === "video" && !videoUrl && seeds
        ? {
            background: `linear-gradient(135deg, ${seeds.accent}, ${seeds.surface})`,
          }
        : undefined;

  return (
    <div className="dsh-cc-page">
      <header className="dsh-cc-header">
        <h2 className="dsh-cc-heading">个性化中心</h2>
        <p className="dsh-cc-intro">
          {tab === "appearance"
            ? "用你自己的图片 / 视频作为壁纸，为 DeepSeek Harness 界面换肤，配色自动跟随画面主色调。"
            : "设置当前模型的最大上下文与每个 agent preset 的自动压缩阈值；保存后写入当前 profile，最大上下文下一次请求起生效，压缩设置对之后新建的会话生效。"}
        </p>
      </header>

      <div className="dsh-cc-tabbar" role="tablist" aria-label="个性化中心">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "appearance"}
          className={`dsh-cc-tabbtn${tab === "appearance" ? " dsh-cc-tabbtn-active" : ""}`}
          onClick={() => setTab("appearance")}
        >
          外观
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "tuning"}
          className={`dsh-cc-tabbtn${tab === "tuning" ? " dsh-cc-tabbtn-active" : ""}`}
          onClick={() => setTab("tuning")}
        >
          上下文与压缩
        </button>
      </div>

      {tab === "tuning" ? <TuningPanel /> : (
      <>
      <section className="dsh-cc-section">
        <h3 className="dsh-cc-section-title">壁纸</h3>
        <button
          type="button"
          className={`dsh-cc-stage ${hasWallpaper ? "dsh-cc-stage-filled" : "dsh-cc-stage-empty"}`}
          style={stageStyle}
          aria-expanded={pickerOpen}
          aria-controls="dsh-cc-picker"
          onClick={() => setPickerOpen((open) => !open)}
        >
          {snap.kind === "video" && videoUrl && (
            <video
              className="dsh-cc-stage-video"
              src={videoUrl}
              muted
              loop
              autoPlay
              playsInline
              aria-hidden="true"
            />
          )}
          <span className="dsh-cc-stage-label">
            {!hasWallpaper && <span className="dsh-cc-stage-plus">+</span>}
            <span>
              {pickerOpen
                ? "点击收起"
                : hasWallpaper
                  ? "点击更换图片 / 视频"
                  : "点击选择图片 / 视频"}
            </span>
          </span>
        </button>
        {pickerOpen && (
          <div id="dsh-cc-picker">
            <LibraryPicker
              controller={controller}
              selectedId={snap.source}
              selectedKind={snap.kind}
              onChosen={() => setPickerOpen(false)}
            />
          </div>
        )}
      </section>

      <section
        className={`dsh-cc-section${hasWallpaper ? "" : " dsh-cc-section-off"}`}
      >
        <h3 className="dsh-cc-section-title">
          效果调节
          {!hasWallpaper && (
            <span className="dsh-cc-section-note">选择壁纸后可调节。</span>
          )}
        </h3>
        <div className="dsh-cc-controls">
          <label className="dsh-cc-slider-row">
            <span className="dsh-cc-slider-label">左侧遮罩（侧边栏）</span>
            <input
              type="range"
              min={0}
              max={100}
              disabled={!hasWallpaper}
              value={snap.sideOpacity}
              onChange={(e) =>
                controller.setOpacity(
                  linked ? "both" : "side",
                  Number(e.target.value),
                )
              }
            />
            <span className="dsh-cc-slider-val">{`${snap.sideOpacity}%`}</span>
          </label>
          <label className="dsh-cc-slider-row">
            <span className="dsh-cc-slider-label">右侧遮罩（主区域）</span>
            <input
              type="range"
              min={0}
              max={100}
              disabled={!hasWallpaper}
              value={snap.bgOpacity}
              onChange={(e) =>
                controller.setOpacity(
                  linked ? "both" : "bg",
                  Number(e.target.value),
                )
              }
            />
            <span className="dsh-cc-slider-val">{`${snap.bgOpacity}%`}</span>
          </label>
          <label className="dsh-cc-slider-row">
            <span className="dsh-cc-slider-label">输入框不透明度</span>
            <input
              type="range"
              min={0}
              max={100}
              disabled={!hasWallpaper}
              value={snap.inputOpacity}
              onChange={(e) =>
                controller.setOpacity("input", Number(e.target.value))
              }
            />
            <span className="dsh-cc-slider-val">{`${snap.inputOpacity}%`}</span>
          </label>
          <div className="dsh-cc-toggle-line">
            <label className="dsh-cc-toggle-row">
              <input
                type="checkbox"
                disabled={!hasWallpaper}
                checked={snap.frosted}
                aria-describedby="dsh-cc-tip-frosted"
                onChange={(e) => controller.setFrosted(e.target.checked)}
              />
              <span>正文加强</span>
              <span id="dsh-cc-tip-frosted" role="tooltip" className="dsh-cc-tip">
                给助手正文加一层轻磨砂底，照片高光区也不影响阅读。
              </span>
            </label>
            <label className="dsh-cc-toggle-row">
              <input
                type="checkbox"
                disabled={!hasWallpaper}
                checked={linked}
                aria-describedby="dsh-cc-tip-linked"
                onChange={(e) => {
                  const next = e.target.checked;
                  setLinked(next);
                  // turning sync on aligns the left side to the right side
                  if (next && snap.sideOpacity !== snap.bgOpacity) {
                    controller.setOpacity("both", snap.bgOpacity);
                  }
                }}
              />
              <span>左右同步</span>
              <span id="dsh-cc-tip-linked" role="tooltip" className="dsh-cc-tip">
                拖动任一侧遮罩滑块，另一侧一起变化。
              </span>
            </label>
          </div>
        </div>
      </section>

      <div className="dsh-cc-bar">
        <span
          className={`dsh-cc-status dsh-cc-status-${statusTone}`}
          role="status"
        >
          <span className="dsh-cc-dot" aria-hidden="true" />
          {status}
        </span>
        <div className="dsh-cc-actions">
          <button
            type="button"
            className="dsh-cc-btn"
            onClick={() => void controller.reset()}
          >
            恢复默认
          </button>
          <button
            type="button"
            className="dsh-cc-btn"
            disabled={!snap.dirty && !snap.previewing}
            onClick={() => controller.discard()}
          >
            撤销更改
          </button>
          <button
            type="button"
            className={`dsh-cc-btn${snap.previewing ? " dsh-cc-btn-active" : ""}`}
            aria-pressed={snap.previewing}
            onClick={() =>
              snap.previewing ? controller.exitPreview() : controller.preview()
            }
          >
            {snap.previewing ? '退出预览' : '预览'}
          </button>
          <button
            type="button"
            className="dsh-cc-btn dsh-cc-btn-primary"
            disabled={!snap.dirty}
            onClick={() => void controller.save()}
          >
            保存
          </button>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
