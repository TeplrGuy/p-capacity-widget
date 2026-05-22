import "./capacityWidget.scss";
import * as SDK from "azure-devops-extension-sdk";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { CommonServiceIds, IProjectPageService } from "azure-devops-extension-api";

const WidgetStatusSuccess = 0;
const WidgetStatusFailure = 1;

interface Settings {
  teamId?: string;
  iterationId?: string;
}

interface Team { id: string; name: string; }
interface Iter { id: string; name: string; path: string; timeFrame?: string; }

async function adoGet(orgUrl: string, path: string): Promise<any> {
  const token = await SDK.getAccessToken();
  const r = await fetch(orgUrl.replace(/\/$/, "") + path, {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" }
  });
  if (!r.ok) throw new Error("GET " + path + " -> " + r.status);
  return r.json();
}

function ConfigUI(props: {
  orgUrl: string;
  projectName: string;
  projectId: string;
  teams: Team[];
  initial: Settings;
  onChange: (s: Settings) => void;
}) {
  const [teamId, setTeamId] = React.useState<string>(props.initial.teamId || (props.teams[0]?.id || ""));
  const [iterationId, setIterationId] = React.useState<string>(props.initial.iterationId || "");
  const [iters, setIters] = React.useState<Iter[]>([]);
  const [loadingIters, setLoadingIters] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string>("");

  async function loadIters(tId: string) {
    setLoadingIters(true);
    setError("");
    try {
      const team = props.teams.find(t => t.id === tId);
      if (!team) { setIters([]); return; }
      const r = await adoGet(
        props.orgUrl,
        `/${encodeURIComponent(props.projectName)}/${encodeURIComponent(team.name)}/_apis/work/teamsettings/iterations?api-version=7.1-preview.1`
      );
      const list: Iter[] = (r.value || []).map((i: any) => ({
        id: i.id, name: i.name, path: i.path, timeFrame: i.attributes?.timeFrame
      }));
      setIters(list);
    } catch (e: any) {
      setError("Failed to load iterations: " + (e?.message || e));
      setIters([]);
    } finally {
      setLoadingIters(false);
    }
  }

  React.useEffect(() => {
    if (teamId) loadIters(teamId);
  }, [teamId]);

  function onTeam(v: string) {
    setTeamId(v);
    setIterationId("");
    props.onChange({ teamId: v || undefined, iterationId: undefined });
  }
  function onIter(v: string) {
    setIterationId(v);
    props.onChange({ teamId: teamId || undefined, iterationId: v || undefined });
  }

  const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600, marginTop: 12, marginBottom: 4 };
  const selectStyle: React.CSSProperties = { width: "100%", padding: "6px", fontSize: 13 };

  return (
    <div style={{ padding: "12px", fontFamily: "Segoe UI", fontSize: 13 }}>
      <label style={labelStyle}>Team</label>
      <select value={teamId} onChange={e => onTeam(e.target.value)} style={selectStyle}>
        {props.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>

      <label style={labelStyle}>Iteration</label>
      <select value={iterationId} onChange={e => onIter(e.target.value)} style={selectStyle} disabled={loadingIters}>
        <option value="">(Current iteration &mdash; auto)</option>
        {iters.map(i => (
          <option key={i.id} value={i.id}>
            {i.name}{i.timeFrame ? ` \u00b7 ${i.timeFrame}` : ""}
          </option>
        ))}
      </select>
      {loadingIters && <div style={{ color: "#605E5C", fontSize: 11, marginTop: 4 }}>Loading iterations&hellip;</div>}
      {error && <div style={{ color: "#A4262C", fontSize: 11, marginTop: 4 }}>{error}</div>}

      <div style={{ color: "#605E5C", fontSize: 11, marginTop: 12 }}>
        Pick the team whose capacity and stories you want to see, then pick a sprint (or leave on &ldquo;Current&rdquo;).
      </div>
    </div>
  );
}

SDK.init({ loaded: false, applyTheme: true }).then(() => {
  let currentSettings: Settings = {};
  let widgetHelpers: any = null;

  let widgetConfigContext: any = null;

  const handler = (helpers: any) => {
    widgetHelpers = helpers;
    return {
      load: async (widgetSettings: any, widgetConfigurationContext?: any) => {
        try {
          widgetConfigContext = widgetConfigurationContext || null;
          const parsed: Settings = widgetSettings.customSettings && widgetSettings.customSettings.data
            ? JSON.parse(widgetSettings.customSettings.data)
            : {};
          currentSettings = parsed;

          const projectSvc = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
          const project = await projectSvc.getProject();
          if (!project) throw new Error("No project");
          const host = SDK.getHost();
          const orgUrl = "https://dev.azure.com/" + host.name;

          const teamsResp = await adoGet(orgUrl, `/_apis/projects/${project.id}/teams?api-version=7.1-preview.3&$top=500`);
          const teams: Team[] = (teamsResp.value || [])
            .map((t: any) => ({ id: t.id, name: t.name }))
            .sort((a: Team, b: Team) => a.name.localeCompare(b.name));
          if (!teams.length) throw new Error("No teams in project");

          ReactDOM.render(
            <ConfigUI
              orgUrl={orgUrl}
              projectName={project.name}
              projectId={project.id}
              teams={teams}
              initial={parsed}
              onChange={(s) => {
                currentSettings = s;
                const customSettings = { data: JSON.stringify(s) };
                const evt = widgetHelpers && widgetHelpers.WidgetEvent;
                const eventName = evt && evt.ConfigurationChange ? evt.ConfigurationChange : "widget-configuration-change";
                const args = evt && evt.Args ? evt.Args(customSettings) : customSettings;
                if (widgetConfigContext && typeof widgetConfigContext.notify === "function") {
                  widgetConfigContext.notify(eventName, args);
                } else if (widgetHelpers && typeof widgetHelpers.notify === "function") {
                  widgetHelpers.notify(eventName, args);
                }
              }}
            />,
            document.getElementById("root")
          );
          return { statusType: WidgetStatusSuccess };
        } catch (e: any) {
          const r = document.getElementById("root");
          if (r) r.innerHTML = '<div style="padding:12px;color:#A4262C">Config error: ' + (e?.message || e) + '</div>';
          return { statusType: WidgetStatusFailure, statusText: e?.message || String(e) };
        }
      },
      onSave: async () => {
        const payload = { data: JSON.stringify(currentSettings) };
        if (widgetHelpers && widgetHelpers.WidgetConfigurationSave && widgetHelpers.WidgetConfigurationSave.Valid) {
          return widgetHelpers.WidgetConfigurationSave.Valid(payload);
        }
        return { isValid: true, customSettings: payload };
      }
    };
  };

  SDK.register("story-capacity-widget-config", handler);
  SDK.register(SDK.getContributionId(), handler);
  SDK.notifyLoadSucceeded();
}).catch((e) => {
  const r = document.getElementById("root");
  if (r) r.innerHTML = '<div style="padding:12px;color:#A4262C">SDK init failed: ' + (e?.message || e) + '</div>';
});
