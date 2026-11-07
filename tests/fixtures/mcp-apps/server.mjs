import { createInterface } from "node:readline";

let apps = false;
let refreshes = 0;
let latestAt = 2;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font:14px system-ui;margin:0;padding:16px;background:var(--color-background-primary,#fff);color:var(--color-text-primary,#111)}
header{display:flex;justify-content:space-between;align-items:center}button{padding:6px 10px;cursor:pointer}pre{white-space:pre-wrap;padding:12px;background:#8882}footer{display:flex;gap:8px}
</style></head><body><header><strong>Deployment</strong><span id="status">Connecting</span></header>
<pre id="logs"></pre><footer><button id="refresh">Refresh</button><button id="debug">Debug logs</button><button id="visit" hidden>Visit</button></footer><script>
let nextId=1; const requests=new Map(); let deployment={}; let logs=[]; let latestAt=2;
function request(method,params){const id=nextId++;parent.postMessage({jsonrpc:'2.0',id,method,params},'*');return new Promise((resolve,reject)=>requests.set(id,{resolve,reject}));}
function notify(method,params){parent.postMessage({jsonrpc:'2.0',method,params},'*');}
function render(){document.getElementById('status').textContent=deployment.status||'Waiting';document.getElementById('logs').textContent=logs.join('\\n');document.getElementById('visit').hidden=deployment.status!=='READY';notify('ui/notifications/size-changed',{height:document.body.scrollHeight});}
addEventListener('message',async event=>{if(event.source!==parent)return;const m=event.data;
if(m.id!==undefined&&requests.has(m.id)){const p=requests.get(m.id);requests.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);return;}
if(m.method==='ui/notifications/tool-result'){deployment=m.params.structuredContent;logs=deployment.logs||[];render();}
if(m.method==='ui/resource-teardown')parent.postMessage({jsonrpc:'2.0',id:m.id,result:{}},'*');
});
document.getElementById('refresh').onclick=async()=>{const r=await request('tools/call',{name:'refresh_deployment',arguments:{id:deployment.id}});deployment=r.structuredContent;const l=await request('tools/call',{name:'read_build_logs',arguments:{since:latestAt}});logs.push(...l.structuredContent.entries);latestAt=l.structuredContent.latestAt;render();await request('ui/update-model-context',{content:[{type:'text',text:'Deployment '+deployment.status+'; '+logs.join('\\n')}]});};
document.getElementById('debug').onclick=()=>request('ui/message',{role:'user',content:[{type:'text',text:'Debug these build logs:\\n'+logs.join('\\n')}]});
document.getElementById('visit').onclick=()=>request('ui/open-link',{url:deployment.url});
request('ui/initialize',{protocolVersion:'2026-01-26',appInfo:{name:'deployment-fixture',version:'1'},appCapabilities:{}}).then(()=>notify('ui/notifications/initialized',{}));
</script></body></html>`;

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  let result;
  switch (message.method) {
    case "initialize":
      apps = !!message.params.capabilities.extensions?.["io.modelcontextprotocol/ui"];
      result = {
        protocolVersion: message.params.protocolVersion,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "deployment-fixture", version: "1" },
      };
      break;
    case "tools/list":
      result = {
        tools: [
          {
            name: "show_deployment",
            inputSchema: { type: "object" },
            ...(apps ? { _meta: { ui: { resourceUri: "ui://fixture/deployment" } } } : {}),
          },
          {
            name: "refresh_deployment",
            inputSchema: { type: "object" },
            _meta: { ui: { visibility: ["app"] } },
          },
          {
            name: "read_build_logs",
            inputSchema: { type: "object" },
            _meta: { ui: { visibility: ["app"] } },
          },
          {
            name: "deploy",
            inputSchema: { type: "object" },
            _meta: { ui: { visibility: ["model"] } },
          },
          { name: "disabled", inputSchema: { type: "object" } },
        ],
      };
      break;
    case "resources/read":
      result = {
        contents: [
          {
            uri: "ui://fixture/deployment",
            mimeType: "text/html;profile=mcp-app",
            text: html,
            _meta: { ui: { prefersBorder: true } },
          },
        ],
      };
      break;
    case "resources/list":
      result = { resources: [] };
      break;
    case "tools/call": {
      const name = message.params.name;
      if (name === "refresh_deployment") refreshes += 1;
      if (name === "read_build_logs") {
        latestAt += 1;
        result = {
          content: [{ type: "text", text: "Build complete" }],
          structuredContent: { entries: ["Build complete"], latestAt },
        };
      } else {
        const deployment = {
          id: "deployment-1",
          status: refreshes ? "READY" : "BUILDING",
          url: "https://example.com/deployment",
          logs: ["Installing dependencies", "Building project"],
        };
        result = {
          content: [{ type: "text", text: deployment.status }],
          structuredContent: deployment,
          _meta: { fixture: "preserved" },
        };
      }
      break;
    }
    default:
      result = {};
  }
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result })}\n`);
});
