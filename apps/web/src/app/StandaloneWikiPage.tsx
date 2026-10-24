import { WikiPanel } from "../components/WikiPanel";
import { homePageHref } from "../scenarioRoutes";

export function StandaloneWikiPage({ demoMode }: { demoMode: boolean }) {
  return (
    <main className="wiki-page">
      <section className="wiki-page__shell" aria-label="Wiki page">
        <div className="wiki-page__header">
          <div className="main-menu__title">
            <span>My Farm</span>
            <h1>Wiki</h1>
          </div>
          <button type="button" onClick={() => window.location.assign(homePageHref())}>
            Back
          </button>
        </div>
        <WikiPanel demoMode={demoMode} />
      </section>
    </main>
  );
}
