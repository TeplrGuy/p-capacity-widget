import "./capacityWidget.scss";
import * as SDK from "azure-devops-extension-sdk";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { CommonServiceIds, IProjectPageService } from "azure-devops-extension-api";

async function adoGet(orgUrl: string, path: string): Promise<any> {
  const token = await SDK.getAccessToken();
  const url = orgUrl.replace(/\/$/, "") + path;
  const r = await fetch(url, {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" }
  });
  if (!r.ok) throw new Error("GET " + path + " -> " + r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
}
async function adoPost(orgUrl: string, path: string, body: any): Promise<any> {
  const token = await SDK.getAccessToken();
  const url = orgUrl.replace(/\/$/, "") + path;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error("POST " + path + " -> " + r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
}

const WidgetStatusSuccess = 0;
const WidgetStatusFailure = 1;

function log(...args: any[]) {
  // eslint-disable-next-line no-console
  console.log("[StoryCapacityWidget]", ...args);
}

window.addEventListener("error", (e) => log("window.error", e.message, e.error));
window.addEventListener("unhandledrejection", (e: any) => log("unhandledrejection", e.reason));

interface PersonLoad {
  displayName: string;
  uniqueName: string;
  imageUrl?: string;
  capacityHours: number;
  activities: { [activity: string]: number }; // remaining work by activity
  activityCapacity: { [activity: string]: number }; // capacity hours by activity
}

interface ActivityTotal {
  name: string;
  capacityHours: number;
  remainingHours: number;
  people: PersonLoad[];
}

interface WidgetData {
  teamName: string;
  iterationName: string;
  workingDays: number;
  totalCapacity: number;
  totalRemaining: number;
  activities: ActivityTotal[];
  unassignedRemaining: number;
}

const ACTIVITY_COLORS: { [k: string]: string } = {
  Development: "#0078D4",
  Design: "#8764B8",
  Testing: "#107C10",
  Documentation: "#CA5010",
  Requirements: "#5C2D91",
  Deployment: "#038387",
  "(no activity)": "#605E5C"
};

function workingDaysBetween(start: Date, end: Date, weekends: number[]): number {
  let days = 0;
  const d = new Date(start);
  while (d <= end) {
    if (!weekends.includes(d.getUTCDay())) days++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

function parseSettings(widgetSettings: any): { iterationId?: string; teamId?: string } {
  try {
    if (widgetSettings && widgetSettings.customSettings && widgetSettings.customSettings.data) {
      return JSON.parse(widgetSettings.customSettings.data) || {};
    }
  } catch {}
  return {};
}

async function loadData(settings: { iterationId?: string; teamId?: string }): Promise<WidgetData> {
  log("step:getProjectService settings=", settings);
  const projectSvc = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
  log("step:getProject");
  const project = await projectSvc.getProject();
  if (!project) throw new Error("No project context");
  log("project=", project.name, project.id);

  const host = SDK.getHost();
  const orgUrl = "https://dev.azure.com/" + host.name;
  log("orgUrl=", orgUrl);

  log("step:getTeams");
  const teamsResp = await adoGet(orgUrl, `/_apis/projects/${project.id}/teams?api-version=7.1-preview.3&$mine=false&$top=500`);
  const teams = teamsResp.value || [];
  log("teams count=", teams.length);
  if (!teams.length) throw new Error("No teams in project");
  let team: any;
  if (settings.teamId) {
    team = teams.find((t: any) => t.id === settings.teamId);
    if (!team) throw new Error("Configured team not found in project (id " + settings.teamId + "). Open widget configuration and pick a team.");
    log("using configured team=", team.name);
  } else {
    team = teams[0];
    log("defaulting to first team=", team.name, "(configure widget to choose a different team)");
  }

  log("step:getTeamIterations");
  let iter: any;
  if (settings.iterationId) {
    log("using configured iterationId=", settings.iterationId);
    iter = await adoGet(orgUrl, `/${encodeURIComponent(project.name)}/${encodeURIComponent(team.name)}/_apis/work/teamsettings/iterations/${settings.iterationId}?api-version=7.1-preview.1`);
  } else {
    const itersResp = await adoGet(orgUrl, `/${encodeURIComponent(project.name)}/${encodeURIComponent(team.name)}/_apis/work/teamsettings/iterations?$timeframe=current&api-version=7.1-preview.1`);
    const iterations = itersResp.value || [];
    log("current iterations=", iterations.length);
    if (!iterations.length) throw new Error("No current iteration for team " + team.name);
    iter = iterations[0];
  }
  log("iter=", iter.name, iter.path);

  log("step:getTeamSettings");
  const teamSettings = await adoGet(orgUrl, `/${encodeURIComponent(project.name)}/${encodeURIComponent(team.name)}/_apis/work/teamsettings?api-version=7.1-preview.1`);
  log("teamSettings.workingDays=", teamSettings.workingDays);
  const weekendsRaw: string[] = teamSettings.workingDays || [];
  const dayMap: { [k: string]: number } = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6
  };
  const workingDayNums = weekendsRaw.map(d => dayMap[String(d).toLowerCase()]);
  const weekends = [0, 1, 2, 3, 4, 5, 6].filter(n => !workingDayNums.includes(n));
  const start = iter.attributes?.startDate ? new Date(iter.attributes.startDate) : new Date();
  const end = iter.attributes?.finishDate ? new Date(iter.attributes.finishDate) : new Date();
  // Match OOB Work Details: count remaining working days (today through end), not full sprint
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const effectiveStart = today > start ? today : start;
  const workingDays = workingDaysBetween(effectiveStart, end, weekends);
  log("workingDays (remaining)=", workingDays);

  log("step:getCapacities workingDays=", workingDays);
  const capResp = await adoGet(orgUrl, `/${encodeURIComponent(project.name)}/${encodeURIComponent(team.name)}/_apis/work/teamsettings/iterations/${iter.id}/capacities?api-version=7.1`);
  log("capResp raw=", capResp);
  // API returns either { value: [...] } or { teamMembers: [...] } depending on flavor
  const capMembers: any[] = capResp.teamMembers || capResp.value || (Array.isArray(capResp) ? capResp : []);
  log("capacities members=", capMembers.length);
  const capByUser: { [userId: string]: { user: any; activities: { name: string; capacityPerDay: number }[]; daysOff: number } } = {};
  for (const c of capMembers) {
    let daysOff = 0;
    for (const off of c.daysOff || []) {
      const s = new Date(off.start);
      const e = new Date(off.end);
      daysOff += workingDaysBetween(s, e, weekends);
    }
    capByUser[c.teamMember.id] = {
      user: c.teamMember,
      activities: c.activities || [],
      daysOff
    };
  }

  log("step:queryByWiql");
  const wiql = {
    query: `SELECT [System.Id] FROM workitems
            WHERE [System.TeamProject] = @project
              AND [System.WorkItemType] = 'User Story'
              AND [System.IterationPath] = '${iter.path.replace(/'/g, "''")}'`
  };
  const qr = await adoPost(orgUrl, `/${project.id}/${team.id}/_apis/wit/wiql?api-version=7.1-preview.2`, wiql);
  const ids = (qr.workItems || []).map((w: any) => w.id);
  log("wiql ids=", ids.length, ids);

  log("step:getWorkItems");
  let stories: any[] = [];
  if (ids.length) {
    const fields = [
      "System.Id",
      "System.Title",
      "System.AssignedTo",
      "Microsoft.VSTS.Common.Activity",
      "Microsoft.VSTS.Scheduling.RemainingWork"
    ].join(",");
    const wiResp = await adoGet(orgUrl, `/${project.id}/_apis/wit/workitems?ids=${ids.join(",")}&fields=${fields}&api-version=7.1-preview.3`);
    stories = wiResp.value || [];
  }
  log("stories fetched=", stories.length);

  // Aggregate
  const activityMap: { [act: string]: ActivityTotal } = {};
  const personMap: { [userId: string]: PersonLoad } = {};
  let unassigned = 0;

  for (const s of stories) {
    const f = s.fields || {};
    const rw = Number(f["Microsoft.VSTS.Scheduling.RemainingWork"] || 0);
    if (!rw) continue;
    const activity = (f["Microsoft.VSTS.Common.Activity"] as string) || "(no activity)";
    const assignee = f["System.AssignedTo"] as any;

    if (!activityMap[activity]) {
      activityMap[activity] = { name: activity, capacityHours: 0, remainingHours: 0, people: [] };
    }
    activityMap[activity].remainingHours += rw;

    if (!assignee) {
      unassigned += rw;
      continue;
    }

    const uid = assignee.id;
    if (!personMap[uid]) {
      personMap[uid] = {
        displayName: assignee.displayName,
        uniqueName: assignee.uniqueName,
        imageUrl: assignee.imageUrl,
        capacityHours: 0,
        activities: {},
        activityCapacity: {}
      };
    }
    personMap[uid].activities[activity] = (personMap[uid].activities[activity] || 0) + rw;
  }

  // Capacity per person + per activity
  let totalCapacity = 0;
  for (const uid of Object.keys(capByUser)) {
    const c = capByUser[uid];
    const personDays = Math.max(workingDays - c.daysOff, 0);
    for (const a of c.activities) {
      const hours = a.capacityPerDay * personDays;
      totalCapacity += hours;
      const actName = a.name || "(no activity)";
      if (!activityMap[actName]) {
        activityMap[actName] = { name: actName, capacityHours: 0, remainingHours: 0, people: [] };
      }
      activityMap[actName].capacityHours += hours;
      if (!personMap[uid]) {
        personMap[uid] = {
          displayName: c.user.displayName,
          uniqueName: c.user.uniqueName,
          imageUrl: c.user.imageUrl,
          capacityHours: 0,
          activities: {},
          activityCapacity: {}
        };
      }
      personMap[uid].capacityHours += hours;
      personMap[uid].activityCapacity[actName] = (personMap[uid].activityCapacity[actName] || 0) + hours;
    }
  }

  // Attach people to their activities
  for (const act of Object.values(activityMap)) {
    for (const p of Object.values(personMap)) {
      if (p.activities[act.name] || (capByUser[Object.keys(personMap).find(k => personMap[k] === p) || ""]?.activities.some(a => (a.name || "(no activity)") === act.name))) {
        act.people.push(p);
      }
    }
  }

  const totalRemaining = Object.values(activityMap).reduce((s, a) => s + a.remainingHours, 0) + unassigned;

  return {
    teamName: team.name,
    iterationName: iter.name,
    workingDays,
    totalCapacity,
    totalRemaining,
    activities: Object.values(activityMap).sort((a, b) => a.name.localeCompare(b.name)),
    unassignedRemaining: unassigned
  };
}

function Bar({ used, total, color }: { used: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const over = total > 0 && used > total;
  const fillColor = over ? "#D13438" : color;
  return (
    <div className="cap-bar-block">
      <div className="cap-bar">
        <div className="cap-bar-fill" style={{ width: pct + "%", background: fillColor }} />
      </div>
      <div className="cap-bar-label">
        {used.toFixed(1)} / {total.toFixed(1)} h
      </div>
    </div>
  );
}

function initials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ person }: { person: PersonLoad }) {
  const [failed, setFailed] = React.useState(false);
  if (person.imageUrl && !failed) {
    return (
      <span className="cap-avatar">
        <img src={person.imageUrl} alt="" onError={() => setFailed(true)} />
      </span>
    );
  }
  return <span className="cap-avatar">{initials(person.displayName)}</span>;
}

function ActivitySection({ act }: { act: ActivityTotal }) {
  const [open, setOpen] = React.useState(true);
  const color = ACTIVITY_COLORS[act.name] || "#605E5C";
  return (
    <div className="cap-activity">
      <div className="cap-activity-header" onClick={() => setOpen(!open)}>
        <span className="cap-chevron">{open ? "▾" : "▸"}</span>
        <span className="cap-dot" style={{ background: color }} />
        <span className="cap-activity-name">{act.name}</span>
        <span className="cap-activity-sum">{act.remainingHours.toFixed(1)} / {act.capacityHours.toFixed(1)} h</span>
      </div>
      {open && (
        <>
          <Bar used={act.remainingHours} total={act.capacityHours} color={color} />
          <div className="cap-people">
            {act.people.map(p => {
              const used = p.activities[act.name] || 0;
              const personActCap = p.activityCapacity[act.name] || 0;
              return (
                <div key={p.uniqueName + act.name} className="cap-person">
                  <Avatar person={p} />
                  <div className="cap-person-body">
                    <div className="cap-person-name" title={p.uniqueName}>{p.displayName}</div>
                    <Bar used={used} total={personActCap} color={color} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function App({ data, error, loading }: { data?: WidgetData; error?: string; loading: boolean }) {
  if (loading) return <div className="cap-msg">Loading capacity...</div>;
  if (error) return <div className="cap-msg cap-error">Error: {error}</div>;
  if (!data) return <div className="cap-msg">No data.</div>;

  return (
    <div className="cap-widget">
      <div className="cap-header">
        <div className="cap-title">{data.teamName} — {data.iterationName}</div>
        <div className="cap-sub">
          {data.workingDays} working days · Team total {data.totalRemaining.toFixed(1)} / {data.totalCapacity.toFixed(1)} h
        </div>
        <Bar used={data.totalRemaining} total={data.totalCapacity} color="#0078D4" />
      </div>

      {data.activities.map(act => <ActivitySection key={act.name} act={act} />)}

      {data.unassignedRemaining > 0 && (
        <div className="cap-activity cap-unassigned">
          <div className="cap-activity-header">
            <span className="cap-chevron">·</span>
            <span className="cap-dot" style={{ background: "#A19F9D" }} />
            <span className="cap-activity-name">Unassigned</span>
            <span className="cap-activity-sum">{data.unassignedRemaining.toFixed(1)} h</span>
          </div>
        </div>
      )}
    </div>
  );
}

SDK.init({ loaded: false, applyTheme: true }).then(() => {
  log("SDK.init resolved; contributionId=", SDK.getContributionId());
  // Register under BOTH short and full ids — host can call either form
  const handler = () => ({
    load: async (widgetSettings: any) => {
      log("load() called", widgetSettings);
      const settings = parseSettings(widgetSettings);
      const root = document.getElementById("root")!;
      ReactDOM.render(<App loading={true} />, root);
      try {
        const data = await loadData(settings);
        log("loadData ok", data);
        ReactDOM.render(<App data={data} loading={false} />, root);
        return { statusType: WidgetStatusSuccess };
      } catch (e: any) {
        log("loadData failed", e);
        ReactDOM.render(<App error={e?.message || String(e)} loading={false} />, root);
        return { statusType: WidgetStatusFailure, statusText: e?.message || String(e) };
      }
    },
    reload: async (widgetSettings: any) => {
      log("reload() called", widgetSettings);
      const settings = parseSettings(widgetSettings);
      const root = document.getElementById("root")!;
      ReactDOM.render(<App loading={true} />, root);
      try {
        const data = await loadData(settings);
        ReactDOM.render(<App data={data} loading={false} />, root);
        return { statusType: WidgetStatusSuccess };
      } catch (e: any) {
        log("reload failed", e);
        ReactDOM.render(<App error={e?.message || String(e)} loading={false} />, root);
        return { statusType: WidgetStatusFailure, statusText: e?.message || String(e) };
      }
    }
  });
  SDK.register("story-capacity-widget", handler);
  SDK.register(SDK.getContributionId(), handler);
  SDK.notifyLoadSucceeded();
  log("notifyLoadSucceeded sent");
}).catch((e) => {
  log("SDK.init rejected", e);
  const r = document.getElementById("root");
  if (r) r.innerHTML = '<div style="padding:12px;color:#A4262C;font-family:Segoe UI">SDK init failed: ' + ((e && e.message) || e) + '</div>';
});
