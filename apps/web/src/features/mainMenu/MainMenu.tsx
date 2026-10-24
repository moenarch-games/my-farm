import { useState, type ReactNode } from "react";
import { WikiPanel } from "../../components/WikiPanel";
import { homePageHref, wikiPageHref } from "../../scenarioRoutes";
import { updateFarmSettings, useFarmSettings } from "../../farmSettings";
import { type FarmView } from "@my-farm/contracts";
import { Metric } from "../hud/TopBar";

type MainMenuPanel = "home" | "settings" | "wiki" | "account";

export function MainMenu({
  view,
  message,
  demoMode,
  onContinue,
  onNewFarm,
  onOpenMarket,
}: {
  view: FarmView;
  message: string;
  demoMode: boolean;
  onContinue: () => void;
  onNewFarm: () => void;
  onOpenMarket: () => void;
}) {
  const [panel, setPanel] = useState<MainMenuPanel>("home");
  const settings = useFarmSettings();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const openHome = () => {
    window.history.pushState(null, "", homePageHref());
    setPanel("home");
  };

  return (
    <section className="main-menu" aria-label="Main menu">
      <div className="main-menu__panel">
        {panel === "home" ? (
          <>
            <div className="main-menu__title">
              <span>{demoMode ? "Browser Demo" : "Local Farm"}</span>
              <h1>My Farm</h1>
            </div>
            <div className="main-menu__stats" aria-label="Farm status">
              <Metric type="level" label={`Level ${view.level}`} />
              <Metric type="coins" label={`${view.coins} coins`} />
              <Metric type="silo" label={`Silo ${view.silo_used}/${view.silo_capacity}`} />
              <Metric type="barn" label={`Barn ${view.barn_used}/${view.barn_capacity}`} />
            </div>
            <div className="main-menu__actions">
              <button className="main-menu__primary" type="button" onClick={onContinue}>
                Start Farm
              </button>
              <button type="button" onClick={onNewFarm}>
                New Farm
              </button>
            </div>
            <nav className="main-menu__options" aria-label="Main menu options">
              <button type="button" onClick={() => setPanel("settings")}>
                Settings
              </button>
              <button type="button" onClick={() => window.location.assign(wikiPageHref())}>
                Wiki
              </button>
              {!demoMode ? (
                <button type="button" onClick={onOpenMarket}>
                  Farmers Market
                </button>
              ) : null}
              <button type="button" onClick={() => setPanel("account")}>
                Account
              </button>
            </nav>
            <small>{message}</small>
          </>
        ) : null}
        {panel === "settings" ? (
          <MainMenuSubpanel title="Settings" onBack={openHome}>
            <div className="main-menu__settings">
              <label>
                <span>Sound</span>
                <input
                  type="checkbox"
                  checked={settings.sound}
                  onChange={(event) => updateFarmSettings({ sound: event.target.checked })}
                />
              </label>
              <label>
                <span>Notifications</span>
                <input
                  type="checkbox"
                  checked={notificationsEnabled}
                  onChange={(event) => setNotificationsEnabled(event.target.checked)}
                />
              </label>
              <label>
                <span>Reduced Motion</span>
                <input
                  type="checkbox"
                  checked={settings.reducedMotion}
                  onChange={(event) => updateFarmSettings({ reducedMotion: event.target.checked })}
                />
              </label>
            </div>
          </MainMenuSubpanel>
        ) : null}
        {panel === "wiki" ? (
          <MainMenuSubpanel title="Wiki" onBack={openHome}>
            <WikiPanel demoMode={demoMode} />
          </MainMenuSubpanel>
        ) : null}
        {panel === "account" ? (
          <MainMenuSubpanel title="Account" onBack={openHome}>
            <div className="main-menu__account">
              <strong>Local Player</strong>
              <span>Farm level {view.level}</span>
              <span>{view.xp} XP earned</span>
              <span>{demoMode ? "Browser-local save" : `${view.delivery_orders.length} delivery orders`}</span>
              <button className="main-menu__primary" type="button" onClick={onContinue}>
                Continue
              </button>
            </div>
          </MainMenuSubpanel>
        ) : null}
      </div>
    </section>
  );
}

export function MainMenuSubpanel({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="main-menu__subheader">
        <div className="main-menu__title">
          <span>My Farm</span>
          <h1>{title}</h1>
        </div>
        <button type="button" onClick={onBack}>
          Back
        </button>
      </div>
      {children}
    </>
  );
}
