"""
组装 Roy 内置市场（resources/market）。

    python scripts/market/assemble_market.py <源码缓存目录>

源码缓存目录里要有：
  skills/<owner>__<repo>/...        各技能仓库的源码（GitHub 下载解压）
  _selection.json                   精选 / 仓库名单
  mcp_bundled/ mcp_inplace/         打好的 npm MCP（bun build）
  mcp_npm_stage/node_modules        原始 npm 包（取 chrome-devtools、excel、授权文件）
  zc_pkgs/<name>/<name>             ZCode 官方插件包（只收 MIT / Apache）

产出：
  resources/market/skills/<slug>/   技能（带原授权文件）
  resources/market/skills.json      技能清单
  resources/market/mcp/<sid>/       MCP 服务端
  resources/market/mcp.json         MCP 清单
全部随安装包分发，运行时不联网、不读本机其他软件的目录。
"""
import json, os, re, shutil, sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
SRC = Path(sys.argv[1]).resolve()
HERE = Path(__file__).resolve().parent
ELECTRON = HERE.parent.parent
OUT = ELECTRON / 'resources' / 'market'
if OUT.exists(): shutil.rmtree(OUT)
(OUT / 'skills').mkdir(parents=True)
(OUT / 'mcp').mkdir(parents=True)
SKIP = shutil.ignore_patterns('node_modules', '.git', '__pycache__', '*.pyc', '.DS_Store')

SEL = json.load(open(SRC / 'mkt_src' / '_selection.json', encoding='utf-8'))

# ---------------------------------------------------------------- 技能
SOURCES = {
    'anthropics/skills': ('Anthropic 官方示例', 'Apache-2.0'),
    'obra/superpowers': ('Superpowers', 'MIT'),
    'vercel-labs/agent-skills': ('Vercel', 'MIT'),
    'heygen-com/hyperframes': ('HyperFrames', 'Apache-2.0'),
    'jimliu/baoyu-skills': ('宝玉', 'MIT'),
    'op7418/Humanizer-zh': ('歸藏', 'MIT'),
    'blader/humanizer': ('Humanizer', 'MIT'),
    'nextlevelbuilder/ui-ux-pro-max-skill': ('UI UX Pro Max', 'MIT'),
    'upstash/context7': ('Context7', 'MIT'),
    'ChromeDevTools/chrome-devtools-mcp': ('Chrome 官方', 'Apache-2.0'),
    'K-Dense-AI/claude-scientific-skills': ('K-Dense 科研', 'MIT'),
    'alirezarezvani/claude-skills': ('Claude Skills 合集', 'MIT'),
    'remotion-dev/skills': ('Remotion 官方', 'Remotion 授权'),
}
# Claude Skills 合集只留常用的
CLAUDE_KEEP = set('''api-design-reviewer api-test-suite-builder changelog-generator ci-cd-pipeline-builder codebase-onboarding database-designer
dependency-auditor focused-fix performance-profiler pr-review-expert rag-architect runbook-generator spec-driven-workflow sql-database-assistant
tech-debt-tracker agent-designer skill-security-auditor product-manager-toolkit product-discovery roadmap-communicator ux-researcher-designer
landing-page-generator competitive-teardown experiment-designer copywriting copy-editing content-strategy social-content seo-audit
launch-strategy pricing-strategy cold-email email-sequence marketing-psychology contract-and-proposal-writer financial-analyst
saas-metrics-coach meeting-analyzer weekly-review deep-work scrum-master senior-pm'''.split())


# 仓库只留常用的（精选里的一律保留）
REPO_KEEP = set('''
brand-guidelines web-artifacts-builder internal-comms
dispatching-parallel-agents executing-plans requesting-code-review receiving-code-review verification-before-completion using-git-worktrees
composition-patterns web-design-guidelines react-view-transitions
general-video hyperframes-animation hyperframes-creative hyperframes-cli slideshow pr-to-video
baoyu-comic baoyu-compress-image baoyu-diagram baoyu-format-markdown baoyu-image-gen baoyu-slide-deck baoyu-wechat-summary
humanizer design-system banner-design
chrome-devtools a11y-debugging debug-optimize-lcp
markitdown exploratory-data-analysis statistical-analysis matplotlib seaborn literature-review scientific-writing citation-management
api-design-reviewer changelog-generator codebase-onboarding database-designer focused-fix pr-review-expert sql-database-assistant
spec-driven-workflow product-manager-toolkit competitive-teardown landing-page-generator copywriting copy-editing content-strategy
social-content seo-audit launch-strategy contract-and-proposal-writer financial-analyst meeting-analyzer weekly-review
remotion-create remotion-captions remotion-render
'''.split())

CATEGORY = [
    ('文档办公', r'docx|xlsx|pptx|pdf|word|excel|slide|office|doc-coauthor|markitdown|contract|proposal|meeting|纪要'),
    ('视频制作', r'video|remotion|hyperframes|faceless|motion|caption|slideshow|talking-head|music-to|media-use'),
    ('设计创作', r'design|ui-|ux|brand|theme|canvas|poster|banner|art|illustrat|cover|infographic|comic|image|figma|diagram|xhs'),
    ('内容写作', r'humaniz|translate|copy|content|writing|social|email|seo|wechat|weibo|post-to|markdown|launch|marketing|pricing|cold'),
    ('写代码', r'debug|test|code|react|vercel|api|ci-cd|database|sql|git|pr-|refactor|plan|brainstorm|spec|agent|skill|mcp|perf|dependency|runbook|chrome|devtools|a11y|lcp|memory-leak|webapp|tech-debt|rag'),
    ('数据与科研', r'data|analy|statist|scien|paper|research|literature|citation|polars|pandas|matplotlib|seaborn|sympy|scikit|shap|umap|pymc|networkx|dask|geopandas|latex|hypothesis|grant|peer|finance|metrics'),
    ('效率与产品', r'product|roadmap|experiment|competitive|landing|scrum|pm|weekly|deep-work|onboarding'),
]

def category_of(slug, desc):
    t = f'{slug} {desc}'.lower()
    for name, pat in CATEGORY:
        if re.search(pat, t): return name
    return '其他'

def repo_root(repo):
    d = SRC / 'mkt_src' / repo.replace('/', '__')
    return d / os.listdir(d)[0]

def repo_license_file(root):
    for f in root.iterdir():
        if f.is_file() and f.name.upper().startswith(('LICENSE', 'LICENCE')): return f
    return None

def frontmatter(md):
    m = re.match(r'^---\s*\n(.*?)\n---', md, re.S)
    meta = {}
    if m:
        for line in m.group(1).splitlines():
            mm = re.match(r'^([A-Za-z_-]+):\s*(.*)$', line)
            if mm: meta[mm.group(1)] = mm.group(2).strip().strip('"\'')
    return meta

skills = {}
def add_skill(slug, src_dir, source, license_name, license_file=None, featured=None, note=''):
    if slug in skills: return
    dst = OUT / 'skills' / slug
    shutil.copytree(src_dir, dst, ignore=SKIP)
    if not any(f.name.upper().startswith(('LICENSE', 'LICENCE')) for f in dst.iterdir()) and license_file:
        shutil.copy(license_file, dst / 'LICENSE.txt')
    md = (dst / 'SKILL.md').read_text(encoding='utf-8', errors='ignore')
    fm = frontmatter(md)
    desc = fm.get('description', '')
    if desc in ('|', '>', '>-', '|-'):
        m = re.search(r'description:\s*[|>]-?\s*\n((?:\s{2,}.*\n)+)', md)
        desc = ' '.join(l.strip() for l in m.group(1).splitlines()) if m else ''
    size = sum(f.stat().st_size for f in dst.rglob('*') if f.is_file())
    skills[slug] = {
        'slug': slug, 'name': fm.get('name') or slug, 'description': desc[:400], 'source': source, 'license': license_name,
        'category': category_of(slug, desc), 'featured': featured, 'note': note, 'kb': size // 1024,
    }

# Roy 自写的四个
ROY = HERE / 'roy-skills'
for slug, zh, d in [('roy-docx', 'Word 文档', '写、改、审阅 .docx'), ('roy-xlsx', 'Excel 表格', '做带公式和图表的 .xlsx'),
                    ('roy-pptx', 'PPT 演示', '按大纲生成 .pptx'), ('roy-pdf', 'PDF', '生成、合并、拆分、加水印')]:
    add_skill(slug, ROY / slug, 'Roy', 'MIT', featured={'zh': zh, 'desc': d})
    skills[slug]['category'] = '文档办公'

def find_skill_dir(repo, name):
    root = repo_root(repo)
    for p in root.rglob('SKILL.md'):
        if 'node_modules' in p.parts: continue
        if p.parent.name == name or (name in ('.', 'humanizer-zh') and p.parent == root): return p.parent
    return None

REMOTION_NOTE = 'Remotion 个人和 3 人以下团队免费，公司使用需要购买 Remotion 授权（remotion.dev/license）'
featured = {(r, n): (zh, d) for r, n, zh, d in SEL['featured'] if r != 'Roy 自写'}
order = [(r, n) for r, n, _, _ in SEL['featured'] if r != 'Roy 自写']
repo_items = [(r, n) for r, _, n in SEL['repo']] + [(r, n) for r, _, n in SEL['remotion']]
seen = set()
for repo, name in order + repo_items:
    if (repo, name) in seen: continue
    seen.add((repo, name))
    if repo == 'alirezarezvani/claude-skills' and name not in CLAUDE_KEEP: continue
    if (repo, name) not in featured and name not in REPO_KEEP and not (name == '.' and repo == 'blader/humanizer'): continue
    d = find_skill_dir(repo, name)
    if d is None: print('  找不到技能', repo, name); continue
    root = repo_root(repo)
    slug = name
    if name == '.': slug = {'op7418/Humanizer-zh': 'humanizer-zh', 'blader/humanizer': 'humanizer'}[repo]
    src_label, lic = SOURCES[repo]
    f = featured.get((repo, name))
    note = REMOTION_NOTE if repo == 'remotion-dev/skills' else ''
    add_skill(slug, d, src_label, lic, repo_license_file(root),
              featured={'zh': f[0].replace('（待确认）', ''), 'desc': f[1]} if f else None, note=note)
    if repo == 'remotion-dev/skills':
        (OUT / 'skills' / slug / 'NOTICE.txt').write_text(REMOTION_NOTE + '\n', encoding='utf-8')

# ZCode 官方插件里的配套技能（MIT）
ZC = SRC / 'zc_pkgs'
ZC_SKILLS = {'jupyter-notebook': ['jupyter-notebook'], 'hyper3d-rodin': ['hyper3d-rodin'], 'unreal-engine': ['unreal-mcp'],
             'cloudbase-skills': ['cloudbase']}
ZC_SLUG = {('openpencil', 'design'): 'openpencil-design', ('typst-workbench', 'typst'): 'typst'}
for plugin, names in ZC_SKILLS.items():
    root = ZC / plugin / plugin
    lic = repo_license_file(root)
    for n in names:
        d = root / 'skills' / n
        if not (d / 'SKILL.md').exists(): print('  ZCode 技能缺失', plugin, n); continue
        add_skill(ZC_SLUG.get((plugin, n), n), d, 'ZCode 插件', 'MIT', lic)

# ---------------------------------------------------------------- MCP
BUNDLED = SRC / 'mcp_bundled'
INPLACE = SRC / 'mcp_inplace'
NM = SRC / 'mcp_npm_stage' / 'node_modules'
NODE = '${ROY_NODE}'
M = '${ROY_MCP}'

def copy_server(sid, src):
    dst = OUT / 'mcp' / sid
    shutil.copytree(src, dst, ignore=SKIP)
    return dst

mcp = []
def add_mcp(id, name, desc, group, license, author, server, needs=(), note='', origin='npm', skill=None, tools=None, home=None, featured=False):
    mcp.append({'id': id, 'name': name, 'description': desc, 'group': group, 'license': license, 'author': author,
                'server': server, 'needs': list(needs), 'note': note, 'origin': origin, 'skill': skill, 'tools': tools,
                'featured': featured})

def npm_bundled(pkg, sid=None):
    sid = sid or pkg.replace('@', '').replace('/', '__')
    copy_server(sid, BUNDLED / sid)
    return [f'{M}/{sid}/server.mjs']

def npm_inplace(pkg, entry_override=None):
    meta = json.load(open(INPLACE / '_inplace.json', encoding='utf-8'))[pkg]
    sid = meta['sid']
    dst = copy_server(sid, INPLACE / sid)
    entry = entry_override or meta['entry']
    return dst, [f'{M}/{sid}/{entry}']

def env(**kw): return kw

# 浏览器与网页
copy_server('playwright-mcp', BUNDLED / 'playwright__mcp')
add_mcp('playwright', '浏览器自动化 Playwright', '用你电脑上的 Chrome 打开网页、点击、填表、截图', '浏览器与网页', 'Apache-2.0', 'Microsoft',
        {'type': 'stdio', 'command': NODE, 'args': [f'{M}/playwright-mcp/server.mjs', '--browser', 'chrome']}, note='需要电脑装了 Chrome', tools=25, featured=True)
copy_server('chrome-devtools-mcp', BUNDLED / 'chrome-devtools-mcp')
add_mcp('chrome-devtools', 'Chrome 调试', '看网页报错、网络请求、性能分析', '浏览器与网页', 'Apache-2.0', 'Google Chrome 团队',
        {'type': 'stdio', 'command': NODE, 'args': [f'{M}/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js']}, note='需要电脑装了 Chrome', tools=32, featured=True)
# 查资料
add_mcp('context7', '查最新文档 Context7', '查各种编程库、框架的最新文档和示例', '查资料', 'MIT', 'Upstash',
        {'type': 'http', 'url': 'https://mcp.context7.com/mcp'}, note='官方远程服务，免 Key 可用', origin='remote', featured=True)
add_mcp('bing-cn', '必应中文搜索', '国内能用的网页搜索，不用 Key', '查资料', 'MIT', 'yan5236',
        {'type': 'stdio', 'command': NODE, 'args': npm_bundled('bing-cn-mcp')}, tools=2, featured=True)
add_mcp('tavily', 'Tavily 搜索', 'AI 搜索和网页提取，每月有免费额度', '查资料', 'MIT', 'Tavily',
        {'type': 'stdio', 'command': NODE, 'args': npm_bundled('tavily-mcp'), 'env': env(TAVILY_API_KEY='')}, needs=['TAVILY_API_KEY（tavily.com 免费申请）'], tools=5)
add_mcp('brave-search', 'Brave 搜索', '网页、图片、新闻、视频搜索', '查资料', 'MIT', 'Brave',
        {'type': 'stdio', 'command': NODE, 'args': npm_bundled('@brave/brave-search-mcp-server'), 'env': env(BRAVE_API_KEY='')}, needs=['BRAVE_API_KEY'], tools=8)
_, a = npm_inplace('firecrawl-mcp')
add_mcp('firecrawl', 'Firecrawl 网页抓取', '整站抓取、批量提取网页正文', '查资料', 'MIT', 'Firecrawl',
        {'type': 'stdio', 'command': NODE, 'args': a, 'env': env(FIRECRAWL_API_KEY='')}, needs=['FIRECRAWL_API_KEY'], tools=28)
# 思考与记忆
_, a = npm_inplace('@modelcontextprotocol/server-sequential-thinking')
add_mcp('sequential-thinking', '分步思考', '复杂问题拆成步骤一步步推理', '思考与记忆', 'MIT', 'MCP 官方',
        {'type': 'stdio', 'command': NODE, 'args': a}, tools=1, featured=True)
_, a = npm_inplace('@modelcontextprotocol/server-memory')
add_mcp('memory', '长期记忆', '用知识图谱记住人物、项目和它们的关系', '思考与记忆', 'MIT', 'MCP 官方',
        {'type': 'stdio', 'command': NODE, 'args': a, 'env': env(MEMORY_FILE_PATH='${ROY_DATA}/mcp-memory.jsonl')}, tools=9, featured=True)
# 文件与办公
_, a = npm_inplace('@modelcontextprotocol/server-filesystem')
add_mcp('filesystem', '文件系统', '读写当前项目文件夹里的文件', '文件与办公', 'MIT', 'MCP 官方',
        {'type': 'stdio', 'command': NODE, 'args': a + ['${WORKSPACE}']}, note='只能访问当前项目文件夹', tools=14)
ex = OUT / 'mcp' / 'excel-mcp-server'; ex.mkdir()
shutil.copy(NM / '@negokaz/excel-mcp-server/dist/excel-mcp-server_windows_amd64_v1/excel-mcp-server.exe', ex / 'excel-mcp-server.exe')
for f in (NM / '@negokaz/excel-mcp-server').iterdir():
    if f.name.upper().startswith('LICENSE'): shutil.copy(f, ex / f.name)
add_mcp('excel', 'Excel 读写', '直接读写 Excel 单元格、公式和格式', '文件与办公', 'MIT', 'negokaz',
        {'type': 'stdio', 'command': f'{M}/excel-mcp-server/excel-mcp-server.exe', 'args': []}, note='目前只带 Windows 版', tools=7, featured=True)
add_mcp('antv-chart', 'AntV 图表', '生成柱状图、折线图、地图等 20 多种图表', '文件与办公', 'MIT', '蚂蚁 AntV',
        {'type': 'stdio', 'command': NODE, 'args': npm_bundled('@antv/mcp-server-chart')}, note='出图时要联网（用 AntV 的渲染服务）', tools=27, featured=True)
# 协作与知识库
_, a = npm_inplace('@notionhq/notion-mcp-server')
add_mcp('notion', 'Notion', 'Notion 官方：读写页面和数据库', '协作与知识库', 'MIT', 'Notion',
        {'type': 'stdio', 'command': NODE, 'args': a, 'env': env(NOTION_TOKEN='')}, needs=['NOTION_TOKEN（Notion 集成密钥）'], tools=24)
add_mcp('lark', '飞书', '飞书官方 OpenAPI：文档、多维表格、消息、日历', '协作与知识库', 'MIT', '飞书',
        {'type': 'stdio', 'command': NODE, 'args': npm_bundled('@larksuiteoapi/lark-mcp') + ['mcp'], 'env': env(APP_ID='', APP_SECRET='')}, needs=['APP_ID', 'APP_SECRET（飞书开放平台自建应用）'], tools=19)
_, a = npm_inplace('dingtalk-mcp')
add_mcp('dingtalk', '钉钉', '钉钉消息、通讯录、日程', '协作与知识库', 'MIT', 'dingtalk-mcp',
        {'type': 'stdio', 'command': NODE, 'args': a, 'env': env(DINGTALK_Client_ID='', DINGTALK_Client_Secret='')}, needs=['DINGTALK_Client_ID', 'DINGTALK_Client_Secret'], tools=13)
add_mcp('slack', 'Slack', '读写 Slack 频道消息', '协作与知识库', 'MIT', 'MCP 官方',
        {'type': 'stdio', 'command': NODE, 'args': npm_bundled('@modelcontextprotocol/server-slack'), 'env': env(SLACK_BOT_TOKEN='', SLACK_TEAM_ID='')}, needs=['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'], tools=8)
# 设计
add_mcp('figma', 'Figma', '读取 Figma 设计稿，还原成代码', '设计', 'MIT', 'GLips',
        {'type': 'stdio', 'command': NODE, 'args': npm_bundled('figma-developer-mcp') + ['--stdio'], 'env': env(FIGMA_API_KEY='')}, needs=['FIGMA_API_KEY'], tools=2)
# 开发与部署
add_mcp('github', 'GitHub', '仓库、Issue、PR、代码搜索', '开发与部署', 'MIT', 'MCP 官方',
        {'type': 'stdio', 'command': NODE, 'args': npm_bundled('@modelcontextprotocol/server-github'), 'env': env(GITHUB_PERSONAL_ACCESS_TOKEN='')}, needs=['GITHUB_PERSONAL_ACCESS_TOKEN'], tools=26)
add_mcp('supabase', 'Supabase', '管理 Supabase 数据库、函数和存储', '开发与部署', 'Apache-2.0', 'Supabase',
        {'type': 'stdio', 'command': NODE, 'args': npm_bundled('@supabase/mcp-server-supabase'), 'env': env(SUPABASE_ACCESS_TOKEN='')}, needs=['SUPABASE_ACCESS_TOKEN'], tools=29)
dst, a = npm_inplace('mongodb-mcp-server')
stub = dst / 'node_modules' / 'cpu-features'; stub.mkdir(parents=True)
(stub / 'package.json').write_text('{"name":"cpu-features","version":"0.0.0","main":"index.js"}', encoding='utf-8')
(stub / 'index.js').write_text('module.exports = function () { return { flags: [] } }\n', encoding='utf-8')
add_mcp('mongodb', 'MongoDB', '查询和管理 MongoDB 数据库', '开发与部署', 'Apache-2.0', 'MongoDB',
        {'type': 'stdio', 'command': NODE, 'args': a, 'env': env(MDB_MCP_CONNECTION_STRING='')}, needs=['MDB_MCP_CONNECTION_STRING（连接串）'], tools=31)
_, a = npm_inplace('@benborla29/mcp-server-mysql')
add_mcp('mysql', 'MySQL', '查询 MySQL 数据库（默认只读）', '开发与部署', 'MIT', 'benborla',
        {'type': 'stdio', 'command': NODE, 'args': a, 'env': env(MYSQL_HOST='127.0.0.1', MYSQL_PORT='3306', MYSQL_USER='', MYSQL_PASS='', MYSQL_DB='')}, needs=['MYSQL_USER', 'MYSQL_PASS', 'MYSQL_DB'], note='填好数据库连接后才会出现工具')
add_mcp('postgres', 'PostgreSQL', 'PostgreSQL 只读查询', '开发与部署', 'MIT', 'MCP 官方',
        {'type': 'stdio', 'command': NODE, 'args': npm_bundled('@modelcontextprotocol/server-postgres') + ['postgresql://用户名:密码@127.0.0.1:5432/数据库']}, needs=['把启动参数里的连接串改成你的'], tools=1)
add_mcp('kubernetes', 'Kubernetes', '查看和管理 K8s 集群', '开发与部署', 'MIT', 'Flux159',
        {'type': 'stdio', 'command': NODE, 'args': npm_bundled('mcp-server-kubernetes')}, needs=['本机的 kubeconfig'], tools=23)
_, a = npm_inplace('@stripe/mcp')
add_mcp('stripe', 'Stripe', 'Stripe 支付：客户、订单、退款', '开发与部署', 'MIT', 'Stripe',
        {'type': 'stdio', 'command': NODE, 'args': a + ['--tools=all'], 'env': env(STRIPE_SECRET_KEY='')}, needs=['STRIPE_SECRET_KEY'])
add_mcp('cloudbase', '腾讯云 CloudBase', '云开发：数据库、云函数、静态托管、小程序部署', '开发与部署', 'MIT', '腾讯云',
        {'type': 'stdio', 'command': NODE, 'args': npm_bundled('@cloudbase/cloudbase-mcp')}, note='首次使用会打开浏览器登录腾讯云', tools=40, skill='cloudbase', origin='zcode')
# 生活与出行
add_mcp('amap', '高德地图', '地点搜索、路线规划、天气', '生活与出行', 'ISC', '高德',
        {'type': 'stdio', 'command': NODE, 'args': npm_bundled('@amap/amap-maps-mcp-server'), 'env': env(AMAP_MAPS_API_KEY='')}, needs=['AMAP_MAPS_API_KEY（高德开放平台）'], tools=12)
add_mcp('baidu-map', '百度地图', '地点搜索、路线、地理编码', '生活与出行', 'MIT', '百度地图',
        {'type': 'stdio', 'command': NODE, 'args': npm_bundled('@baidumap/mcp-server-baidu-map'), 'env': env(BAIDU_MAP_API_KEY='')}, needs=['BAIDU_MAP_API_KEY'], tools=10)
_, a = npm_inplace('howtocook-mcp', 'build/data/index.roy.mjs')
add_mcp('howtocook', '今天吃什么', '按人数和口味推荐菜谱', '生活与出行', 'ISC', 'worryzyy',
        {'type': 'stdio', 'command': NODE, 'args': a}, tools=5)

# ZCode 官方插件里的 MCP（整包移植，只收 MIT / Apache）
ZC_MCP = [
    ('excalidraw', 'Excalidraw 手绘图', '生成和编辑手绘风格的流程图、架构图并导出', 'MIT', 'excalidraw', 9, {}),
    ('openpencil', 'OpenPencil 设计稿', '读写工作区里的 Figma .fig 设计稿', 'MIT', 'openpencil-design', 117, {'ZCODE_PLUGIN_DATA': '${ROY_DATA}/mcp-data/openpencil'}),
    ('jupyter-notebook', 'Jupyter Notebook', '连接或启动 Jupyter，读写并运行 notebook 单元格', 'MIT', 'jupyter-notebook', 17, {}),
    ('typst-workbench', 'Typst 排版', '用本机的 Typst 编译、检查、导出 PDF', 'MIT', 'typst', 10, {'ZCODE_PLUGIN_DATA': '${ROY_DATA}/mcp-data/typst'}),
    ('zotero', 'Zotero 文献库', '搜索和阅读你的 Zotero 文献、高亮，生成引用', 'MIT', 'zotero', 21, {'ZCODE_PLUGIN_DATA': '${ROY_DATA}/mcp-data/zotero'}),
    ('wordcraft', 'WordCraft 文字处理', '打开、编辑、保存 Word 文档', 'Apache-2.0', None, 22, {}),
    ('gridcraft', 'GridCraft 电子表格', '读写单元格、公式和工作簿', 'Apache-2.0', None, 27, {}),
    ('deckcraft', 'DeckCraft 演示文稿', '新建、编辑、导出演示文稿', 'Apache-2.0', None, 31, {}),
    ('pdfcraft', 'PDFCraft', 'PDF 页面、批注、表单、导出', 'Apache-2.0', None, 165, {}),
    ('photocraft', 'PhotoCraft 图片编辑', '图层、调色、导出图片', 'Apache-2.0', None, 31, {}),
    ('vectorcraft', 'VectorCraft 矢量图', '矢量绘图和 SVG 导出', 'Apache-2.0', None, 38, {}),
    ('designcraft', 'DesignCraft 排版设计', '版式设计、文字排版、导出', 'Apache-2.0', None, 31, {}),
    ('cadcraft', 'CADCraft 绘图', 'CAD 图纸绘制、查询图元、渲染', 'Apache-2.0', None, 20, {}),
    ('soundcraft', 'SoundCraft 音频', '音频剪辑、混音、导出', 'Apache-2.0', None, 23, {}),
]
for name, zh, desc, lic, skill, tools, extra_env in ZC_MCP:
    sid = f'zcode-{name}'
    copy_server(sid, ZC / name / name)
    (OUT / 'mcp' / sid / 'skills').exists() and shutil.rmtree(OUT / 'mcp' / sid / 'skills')
    e = {'ZCODE_WORKSPACE_ROOT': '${WORKSPACE}', **extra_env}
    add_mcp(f'zcode-{name}', zh, desc, 'ZCode 插件', lic, 'ZCode', {'type': 'stdio', 'command': NODE, 'args': [f'{M}/{sid}/dist/server.mjs'], 'env': e, 'timeout': 60},
            note='原本带 ZCode 侧栏界面，在 Roy 里只用它的工具，打不开编辑器面板' if 'craft' in name or name in ('excalidraw', 'openpencil') else '',
            origin='zcode', skill=skill, tools=tools)
add_mcp('hyper3d-rodin', 'Hyper3D Rodin 3D 生成', '用文字或参考图生成 3D 模型', 'ZCode 插件', 'MIT', 'Deemos',
        {'type': 'http', 'url': 'https://api.hyper3d.com/api/mcp'}, needs=['Hyper3D 账号（首次使用按提示授权）'], origin='zcode', skill='hyper3d-rodin')
add_mcp('tripo-3d', 'Tripo 3D 生成', '一句话或一张图生成带贴图的 3D 模型', 'ZCode 插件', 'Tripo 官方服务', 'VAST',
        {'type': 'http', 'url': 'https://developers.tripo3d.com/mcp'}, needs=['Tripo 账号（首次使用按提示授权）'], origin='zcode')
add_mcp('unreal-engine', '虚幻引擎 UE', '通过 Epic 官方 MCP 操作 UE 编辑器', 'ZCode 插件', 'MIT', 'Epic Games',
        {'type': 'http', 'url': 'http://127.0.0.1:8000/mcp'}, needs=['UE 里启用 ModelContextProtocol 插件'], origin='zcode', skill='unreal-mcp')

MCP_KEEP = {'playwright', 'chrome-devtools', 'context7', 'bing-cn', 'tavily', 'firecrawl', 'sequential-thinking', 'memory', 'filesystem', 'antv-chart', 'notion', 'lark', 'dingtalk', 'figma', 'github', 'supabase', 'postgres', 'cloudbase', 'amap', 'zcode-jupyter-notebook', 'hyper3d-rodin', 'tripo-3d', 'unreal-engine'}
mcp = [m for m in mcp if m['id'] in MCP_KEEP]
used = set()
for m in mcp:
    for v in [m['server'].get('command') or ''] + (m['server'].get('args') or []):
        mm = re.match(r'\$\{ROY_MCP\}/([^/]+)', v)
        if mm: used.add(mm.group(1))
for d in list((OUT / 'mcp').iterdir()):
    if d.is_dir() and d.name not in used: shutil.rmtree(d)
# 配套技能要存在
for m in mcp:
    if m['skill'] and m['skill'] not in skills: print('  配套技能缺失', m['id'], m['skill']); m['skill'] = None

json.dump(sorted(skills.values(), key=lambda s: (s['featured'] is None, s['source'], s['slug'])), open(OUT / 'skills.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(mcp, open(OUT / 'mcp.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

def mb(p): return round(sum(f.stat().st_size for f in p.rglob('*') if f.is_file()) / 1048576, 1)
print('技能', len(skills), '精选', sum(1 for s in skills.values() if s['featured']), 'MB', mb(OUT / 'skills'))
print('MCP', len(mcp), 'MB', mb(OUT / 'mcp'))
from collections import Counter
print(Counter(s['source'] for s in skills.values()))
print(Counter(s['category'] for s in skills.values()))
