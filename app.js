/**
 * FishBanks Web Simulator - 前端控制器與 Google Sheets Webhook 串接模組
 */

let sim = null;
let charts = {};

// 預設或使用者保存的 Google Apps Script Webhook 網址
const STORAGE_KEY_WEBHOOK = "fishbanks_gas_webhook_url";
const STORAGE_KEY_CLASS = "fishbanks_student_class";
const STORAGE_KEY_ID = "fishbanks_student_id";
const STORAGE_KEY_NAME = "fishbanks_student_name";

document.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) lucide.createIcons();
    initSimulation();
    setupInputs();
    setupCharts();
    setupGoogleSheetsModule();
    updateUI();
});

function initSimulation() {
    sim = new FishBanksEngine();
}

function setupInputs() {
    // 1. 漁場分配滑桿 (Coastal, DeepSea, Harbor 自動平衡)
    const sliderCoastal = document.getElementById('slider-allocCoastal');
    const sliderDeepSea = document.getElementById('slider-allocDeepSea');

    if (sliderCoastal) {
        sliderCoastal.addEventListener('input', () => {
            balanceAllocation('coastal');
        });
    }

    if (sliderDeepSea) {
        sliderDeepSea.addEventListener('input', () => {
            balanceAllocation('deepSea');
        });
    }

    // 2. 造船與拆船輸入
    const inputNewShips = document.getElementById('inputNewShips');
    const inputScrapShips = document.getElementById('inputScrapShips');

    if (inputNewShips) {
        inputNewShips.addEventListener('input', (e) => {
            const count = Math.max(0, parseInt(e.target.value || 0));
            document.getElementById('valBuildExpense').textContent = `$${(count * sim.shipBuildCost).toLocaleString()}`;
            calculateEstimatedCosts();
        });
    }

    if (inputScrapShips) {
        inputScrapShips.addEventListener('input', (e) => {
            const player = sim.teams.find(t => !t.isAI);
            let count = Math.max(0, parseInt(e.target.value || 0));
            count = Math.min(player.ships, count);
            e.target.value = count;
            document.getElementById('valScrapRevenue').textContent = `+$${(count * sim.shipSalvageValue).toLocaleString()}`;
            calculateEstimatedCosts();
        });
    }

    // 3. 制度政策管制開關
    const chkInstitution = document.getElementById('chkInstitution');
    const quotaControls = document.getElementById('quotaControls');
    const regimeBadge = document.getElementById('regimeBadge');

    if (chkInstitution) {
        chkInstitution.addEventListener('change', (e) => {
            sim.institution.enabled = e.target.checked;
            if (e.target.checked) {
                quotaControls.classList.remove('opacity-50', 'pointer-events-none');
                regimeBadge.className = 'text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold border border-indigo-200';
                regimeBadge.textContent = '🛡️ 配額管理制度已生效';
                updateQuotaValues();
            } else {
                quotaControls.classList.add('opacity-50', 'pointer-events-none');
                regimeBadge.className = 'text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium border border-slate-200';
                regimeBadge.textContent = '開放自由競爭';
            }
        });
    }

    const inputQuotaCoastal = document.getElementById('inputQuotaCoastal');
    const inputQuotaDeepSea = document.getElementById('inputQuotaDeepSea');
    if (inputQuotaCoastal) inputQuotaCoastal.addEventListener('input', updateQuotaValues);
    if (inputQuotaDeepSea) inputQuotaDeepSea.addEventListener('input', updateQuotaValues);

    // 4. 預設策略按鈕
    const btnPresetDeep = document.getElementById('btnPresetDeep');
    const btnPresetBalance = document.getElementById('btnPresetBalance');
    const btnPresetSafe = document.getElementById('btnPresetSafe');

    if (btnPresetDeep) {
        btnPresetDeep.addEventListener('click', () => {
            const player = sim.teams.find(t => !t.isAI);
            const deep = Math.round(player.ships * 0.7);
            const coastal = player.ships - deep;
            setAllocationValues(coastal, deep);
        });
    }

    if (btnPresetBalance) {
        btnPresetBalance.addEventListener('click', () => {
            const player = sim.teams.find(t => !t.isAI);
            const coastal = Math.floor(player.ships / 2);
            const deep = player.ships - coastal;
            setAllocationValues(coastal, deep);
        });
    }

    if (btnPresetSafe) {
        btnPresetSafe.addEventListener('click', () => {
            setAllocationValues(0, 0); // 全部留港
        });
    }

    // 5. 推進與控制按鈕
    const btnStep1 = document.getElementById('btnStep1');
    const btnStep5 = document.getElementById('btnStep5');
    const btnReset = document.getElementById('btnReset');
    const btnExportCSV = document.getElementById('btnExportCSV');

    if (btnStep1) btnStep1.addEventListener('click', () => runYears(1));
    if (btnStep5) btnStep5.addEventListener('click', () => runYears(5));
    if (btnReset) btnReset.addEventListener('click', resetSimulation);
    if (btnExportCSV) btnExportCSV.addEventListener('click', exportCSV);

    calculateEstimatedCosts();
}

function updateQuotaValues() {
    const qC = parseInt(document.getElementById('inputQuotaCoastal')?.value || 3);
    const qD = parseInt(document.getElementById('inputQuotaDeepSea')?.value || 4);
    sim.institution.coastalQuotaPerTeam = qC;
    sim.institution.deepSeaQuotaPerTeam = qD;
}

function balanceAllocation(source) {
    const player = sim.teams.find(t => !t.isAI);
    const sliderC = document.getElementById('slider-allocCoastal');
    const sliderD = document.getElementById('slider-allocDeepSea');
    const sliderH = document.getElementById('slider-allocHarbor');

    let c = parseInt(sliderC.value || 0);
    let d = parseInt(sliderD.value || 0);

    // 總和不可超過現有總船隻
    if (source === 'coastal') {
        if (c > player.ships) c = player.ships;
        if (c + d > player.ships) d = player.ships - c;
    } else if (source === 'deepSea') {
        if (d > player.ships) d = player.ships;
        if (c + d > player.ships) c = player.ships - d;
    }

    const h = Math.max(0, player.ships - c - d);

    sliderC.value = c;
    sliderD.value = d;
    sliderH.value = h;

    document.getElementById('display-allocCoastal').textContent = `${c} 艘`;
    document.getElementById('display-allocDeepSea').textContent = `${d} 艘`;
    document.getElementById('display-allocHarbor').textContent = `${h} 艘`;

    document.getElementById('cost-allocCoastal').textContent = `$${(c * sim.coastal.operatingCostPerShip).toLocaleString()}`;
    document.getElementById('cost-allocDeepSea').textContent = `$${(d * sim.deepSea.operatingCostPerShip).toLocaleString()}`;
    document.getElementById('cost-allocHarbor').textContent = `$${(h * sim.harborOperatingCostPerShip).toLocaleString()}`;

    calculateEstimatedCosts();
}

function setAllocationValues(c, d) {
    const player = sim.teams.find(t => !t.isAI);
    c = Math.min(player.ships, Math.max(0, c));
    d = Math.min(player.ships - c, Math.max(0, d));
    const h = player.ships - c - d;

    document.getElementById('slider-allocCoastal').value = c;
    document.getElementById('slider-allocDeepSea').value = d;
    document.getElementById('slider-allocHarbor').value = h;

    document.getElementById('display-allocCoastal').textContent = `${c} 艘`;
    document.getElementById('display-allocDeepSea').textContent = `${d} 艘`;
    document.getElementById('display-allocHarbor').textContent = `${h} 艘`;

    calculateEstimatedCosts();
}

function calculateEstimatedCosts() {
    const c = parseInt(document.getElementById('slider-allocCoastal')?.value || 0);
    const d = parseInt(document.getElementById('slider-allocDeepSea')?.value || 0);
    const h = parseInt(document.getElementById('slider-allocHarbor')?.value || 0);
    const newShips = parseInt(document.getElementById('inputNewShips')?.value || 0);

    const opsCost = (c * sim.coastal.operatingCostPerShip) + (d * sim.deepSea.operatingCostPerShip) + (h * sim.harborOperatingCostPerShip);
    const buildCost = newShips * sim.shipBuildCost;

    document.getElementById('valTotalEstCost').textContent = `$${opsCost.toLocaleString()}`;
}

function getPlayerDecisions() {
    const c = parseInt(document.getElementById('slider-allocCoastal')?.value || 0);
    const d = parseInt(document.getElementById('slider-allocDeepSea')?.value || 0);
    const h = parseInt(document.getElementById('slider-allocHarbor')?.value || 0);
    const newShips = parseInt(document.getElementById('inputNewShips')?.value || 0);
    const scrapShips = parseInt(document.getElementById('inputScrapShips')?.value || 0);

    return {
        allocation: { coastal: c, deepSea: d, harbor: h },
        newShipsOrdered: newShips,
        shipsScrapped: scrapShips
    };
}

function runYears(count = 1) {
    if (sim.isGameOver) {
        alert('模擬已結束！若欲再次嘗試，請點擊「重新開局」。');
        return;
    }

    const decisions = getPlayerDecisions();
    for (let i = 0; i < count; i++) {
        if (sim.isGameOver) break;
        sim.step(decisions);
    }

    // 重置單年輸入項 (新船訂造量重置為 0)
    document.getElementById('inputNewShips').value = 0;
    document.getElementById('inputScrapShips').value = 0;
    document.getElementById('valBuildExpense').textContent = '$0';
    document.getElementById('valScrapRevenue').textContent = '+$0';

    updateUI();
    if (window.lucide) lucide.createIcons();

    // 若正好進入遊戲結束狀態，自動彈出成績回傳視窗
    if (sim.isGameOver) {
        openSubmitModal();
    }
}

function resetSimulation() {
    if (confirm('確定要重新開始 FishBanks 模擬嗎？')) {
        sim.reset();
        updateUI();
        if (window.lucide) lucide.createIcons();
    }
}

function updateUI() {
    const st = sim.getCurrentStatus();
    const player = st.player;

    // Header KPIs
    setText('kpiYear', `第 ${Math.min(st.maxYears, st.year)} 年`);
    setText('kpiTotalFish', `${(st.coastal.fish + st.deepSea.fish).toLocaleString()} 尾`);
    setText('kpiPlayerAssets', `$${player.totalAssets.toLocaleString()}`);

    const btnYear = document.getElementById('btnYearNum');
    if (btnYear) btnYear.textContent = Math.min(st.maxYears, st.year);

    // Update Slider max values to match current player ship count
    ['slider-allocCoastal', 'slider-allocDeepSea', 'slider-allocHarbor'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.max = player.ships;
    });
    setText('valMyTotalShips', player.ships);

    // Fisheries info
    setText('valCoastalFish', `${st.coastal.fish.toLocaleString()} / ${st.coastal.carryingCapacity.toLocaleString()} 尾`);
    setText('valDeepSeaFish', `${st.deepSea.fish.toLocaleString()} / ${st.deepSea.carryingCapacity.toLocaleString()} 尾`);

    const cPct = Math.min(100, Math.round((st.coastal.fish / st.coastal.carryingCapacity) * 100));
    const dPct = Math.min(100, Math.round((st.deepSea.fish / st.deepSea.carryingCapacity) * 100));

    const barC = document.getElementById('barCoastalFish');
    const barD = document.getElementById('barDeepSeaFish');
    if (barC) {
        barC.style.width = `${cPct}%`;
        barC.className = cPct < 20 ? 'bg-rose-500 h-full rounded-full transition-all' : (cPct < 45 ? 'bg-amber-500 h-full rounded-full transition-all' : 'bg-emerald-500 h-full rounded-full transition-all');
    }
    if (barD) {
        barD.style.width = `${dPct}%`;
        barD.className = dPct < 20 ? 'bg-rose-500 h-full rounded-full transition-all' : (dPct < 45 ? 'bg-amber-500 h-full rounded-full transition-all' : 'bg-blue-500 h-full rounded-full transition-all');
    }

    const badgeC = document.getElementById('coastalHealthBadge');
    if (badgeC) {
        badgeC.textContent = `健康度 ${cPct}%`;
        badgeC.className = cPct < 20 ? 'text-xs bg-rose-50 text-rose-700 px-2.5 py-0.5 rounded-full font-bold border border-rose-200' : 'text-xs bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full font-bold border border-emerald-200';
    }

    const badgeD = document.getElementById('deepSeaHealthBadge');
    if (badgeD) {
        badgeD.textContent = `健康度 ${dPct}%`;
        badgeD.className = dPct < 20 ? 'text-xs bg-rose-50 text-rose-700 px-2.5 py-0.5 rounded-full font-bold border border-rose-200' : 'text-xs bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full font-bold border border-blue-200';
    }

    setText('valCoastalShips', `${st.coastal.shipsDeployed} 艘`);
    setText('valDeepSeaShips', `${st.deepSea.shipsDeployed} 艘`);

    const cRate = sim.calculateCatchPerShip(st.coastal.fish, st.coastal.area);
    const dRate = sim.calculateCatchPerShip(st.deepSea.fish, st.deepSea.area);
    setText('valCoastalCatchPerShip', `${cRate.toFixed(1)} 尾/艘`);
    setText('valDeepSeaCatchPerShip', `${dRate.toFixed(1)} 尾/艘`);

    setText('valCoastalRegen', `+${st.coastal.regenerationThisYear} 尾/年`);
    setText('valDeepSeaRegen', `+${st.deepSea.regenerationThisYear} 尾/年`);

    // Render 4-Team Competition Cards
    renderTeamCards();

    // Render Game Over Status Banner
    renderGameBanner();

    // Render History Table & Charts
    renderTable();
    updateCharts();
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function renderTeamCards() {
    const container = document.getElementById('teamCardsContainer');
    if (!container) return;

    // Sort by Total Assets descending
    const sorted = [...sim.teams].sort((a, b) => b.totalAssets - a.totalAssets);

    container.innerHTML = '';
    sorted.forEach((team, idx) => {
        const isUser = !team.isAI;
        const card = document.createElement('div');
        card.className = `p-4 rounded-xl border transition ${isUser ? 'bg-blue-50/60 border-blue-300 ring-2 ring-blue-500/20' : 'bg-slate-50 border-slate-200'}`;

        const rankBadge = idx === 0 ? '🥇 第 1 名' : (idx === 1 ? '🥈 第 2 名' : (idx === 2 ? '🥉 第 3 名' : `第 4 名`));

        card.innerHTML = `
            <div class="flex items-center justify-between border-b border-slate-200/60 pb-2">
                <span class="text-xs font-bold ${idx === 0 ? 'text-amber-600' : 'text-slate-500'}">${rankBadge}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${isUser ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'}">${isUser ? '玩家' : 'AI 對手'}</span>
            </div>
            <div class="mt-2 space-y-1.5 text-xs">
                <div class="font-bold text-slate-900 truncate">${team.name}</div>
                <div class="flex justify-between text-slate-600"><span>總資產：</span><strong class="font-mono text-slate-900 font-bold">$${team.totalAssets.toLocaleString()}</strong></div>
                <div class="flex justify-between text-slate-500 text-[11px]"><span>現金存款：</span><strong class="font-mono">$${Math.round(team.bankBalance).toLocaleString()}</strong></div>
                <div class="flex justify-between text-slate-500 text-[11px]"><span>船隻規模：</span><strong class="font-mono">${team.ships} 艘</strong></div>
                <div class="flex justify-between text-slate-500 text-[11px]"><span>本年捕撈量：</span><strong class="font-mono text-cyan-700">${team.catchThisYear.total} 尾</strong></div>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderGameBanner() {
    const banner = document.getElementById('gameStatusBanner');
    if (!banner) return;

    if (sim.isGameOver) {
        banner.classList.remove('hidden');
        if (sim.isWon) {
            banner.className = 'p-5 rounded-2xl border border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm';
            banner.innerHTML = `
                <div class="flex items-start gap-4">
                    <span class="text-3xl">🏆</span>
                    <div>
                        <h4 class="font-bold text-base text-emerald-900">恭喜！達成永續海洋與資產冠軍 (Winner & Sustainable Steward)</h4>
                        <p class="text-xs text-emerald-800 mt-1 leading-relaxed">${sim.gameOverReason}</p>
                        <div class="mt-3 flex gap-2">
                            <button onclick="openSubmitModal()" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow flex items-center gap-1.5">
                                <i data-lucide="send" class="w-3.5 h-3.5"></i>
                                <span>登記成績至試算表</span>
                            </button>
                            <button onclick="resetSimulation()" class="px-4 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-semibold">再次挑戰</button>
                            <button onclick="exportCSV()" class="px-4 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold">匯出歷史報表</button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            banner.className = 'p-5 rounded-2xl border border-rose-300 bg-rose-50 text-rose-950 shadow-sm';
            banner.innerHTML = `
                <div class="flex items-start gap-4">
                    <span class="text-3xl">⚠️</span>
                    <div>
                        <h4 class="font-bold text-base text-rose-900">模擬結束：公地悲劇或船隊失利</h4>
                        <p class="text-xs text-rose-800 mt-1 leading-relaxed">${sim.gameOverReason}</p>
                        <div class="text-[11px] text-rose-700 mt-2 bg-white/70 p-2.5 rounded-lg border border-rose-200">
                            💡 政策省思（Dennis Meadows 與 Ruiz-Pérez 研究）：在開放海域中，個人理性追求利潤最大化將導致集體盲目擴張船隊，最終必然導致魚群枯竭；嘗試開啟「制度管理與配額限制」或克制船隊規模，才能實現長期繁榮！
                        </div>
                        <div class="mt-3 flex gap-2">
                            <button onclick="openSubmitModal()" class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow flex items-center gap-1.5">
                                <i data-lucide="send" class="w-3.5 h-3.5"></i>
                                <span>登記成績至試算表</span>
                            </button>
                            <button onclick="resetSimulation()" class="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow">重新開局嘗試新策略</button>
                        </div>
                    </div>
                </div>
            `;
        }
        if (window.lucide) lucide.createIcons();
    } else {
        banner.classList.add('hidden');
    }
}

function renderTable() {
    const tbody = document.getElementById('historyTableBody');
    const countBadge = document.getElementById('tableRecordCount');
    if (!tbody) return;

    const records = sim.history.filter(h => h.year > 0).slice().reverse();
    if (countBadge) countBadge.textContent = `共 ${records.length} 筆紀錄`;

    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="p-4 text-center text-slate-400 font-sans italic">尚無營運數據，請點擊「推進 1 年」開始出海捕撈</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    records.forEach(r => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';

        const totalFishPct = Math.round((r.totalFish / 6000) * 100);
        const healthBadge = totalFishPct < 20 
            ? `<span class="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">瀕臨崩潰</span>`
            : (totalFishPct < 45 ? `<span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">過度捕撈</span>` : `<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold">健康穩定</span>`);

        tr.innerHTML = `
            <td class="p-2.5 font-bold text-slate-900">第 ${r.year} 年</td>
            <td class="p-2.5 text-right font-medium text-slate-700">${r.coastalFish.toLocaleString()}</td>
            <td class="p-2.5 text-right font-medium text-slate-700">${r.deepSeaFish.toLocaleString()}</td>
            <td class="p-2.5 text-right font-bold text-cyan-700">${r.totalFish.toLocaleString()}</td>
            <td class="p-2.5 text-right font-medium text-slate-800">${r.totalCatch.toLocaleString()}</td>
            <td class="p-2.5 text-right font-mono text-blue-600">${r.totalShips} 艘</td>
            <td class="p-2.5 text-right font-mono text-slate-800">${r.playerShips} 艘</td>
            <td class="p-2.5 text-right font-mono text-slate-800">$${Math.round(r.playerCash).toLocaleString()}</td>
            <td class="p-2.5 text-right font-mono font-bold text-emerald-600">$${r.playerAssets.toLocaleString()}</td>
            <td class="p-2.5 text-center font-sans">${healthBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

function setupCharts() {
    const lightGrid = { color: 'rgba(226, 232, 240, 0.8)', drawBorder: false };
    const lightTicks = { color: '#475569', font: { size: 10, family: 'JetBrains Mono' } };
    const commonPlugins = {
        legend: { labels: { color: '#334155', font: { size: 11, weight: '500' }, boxWidth: 12 } },
        tooltip: {
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            titleColor: '#0f172a',
            bodyColor: '#334155',
            borderColor: '#cbd5e1',
            borderWidth: 1,
            padding: 8
        }
    };

    // Chart 1: Fish Population
    const ctxFish = document.getElementById('chartFish')?.getContext('2d');
    if (ctxFish) {
        charts.fish = new Chart(ctxFish, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    { label: '海域總魚量', data: [], borderColor: '#0284c7', backgroundColor: 'rgba(2, 132, 199, 0.08)', fill: true, tension: 0.2, borderWidth: 2.5 },
                    { label: '沿海魚量', data: [], borderColor: '#10b981', borderDash: [4, 4], tension: 0.2, borderWidth: 2 },
                    { label: '深海魚量', data: [], borderColor: '#6366f1', borderDash: [4, 4], tension: 0.2, borderWidth: 2 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: commonPlugins,
                scales: { x: { grid: lightGrid, ticks: lightTicks }, y: { grid: lightGrid, ticks: lightTicks } }
            }
        });
    }

    // Chart 2: Catch vs Ships
    const ctxCatchFleet = document.getElementById('chartCatchFleet')?.getContext('2d');
    if (ctxCatchFleet) {
        charts.catchFleet = new Chart(ctxCatchFleet, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    { label: '年總魚獲量 (尾)', data: [], borderColor: '#059669', yAxisID: 'y', tension: 0.2, borderWidth: 2.5 },
                    { label: '全球總船隻數 (艘)', data: [], borderColor: '#f59e0b', yAxisID: 'y1', tension: 0.2, borderWidth: 2.5 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: commonPlugins,
                scales: {
                    x: { grid: lightGrid, ticks: lightTicks },
                    y: { type: 'linear', position: 'left', grid: lightGrid, ticks: lightTicks, title: { display: true, text: '魚獲 (尾)', color: '#64748b', font: { size: 9 } } },
                    y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, ticks: lightTicks, title: { display: true, text: '船隊規模 (艘)', color: '#64748b', font: { size: 9 } } }
                }
            }
        });
    }

    // Chart 3: Assets Comparison
    const ctxAssets = document.getElementById('chartAssets')?.getContext('2d');
    if (ctxAssets) {
        charts.assets = new Chart(ctxAssets, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    { label: '您的船隊', data: [], borderColor: '#2563eb', borderWidth: 3 },
                    { label: '阿爾法遠洋', data: [], borderColor: '#ef4444', borderWidth: 1.5, borderDash: [2, 2] },
                    { label: '貝塔水產', data: [], borderColor: '#10b981', borderWidth: 1.5, borderDash: [2, 2] },
                    { label: '伽瑪漁業', data: [], borderColor: '#8b5cf6', borderWidth: 1.5, borderDash: [2, 2] }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: commonPlugins,
                scales: { x: { grid: lightGrid, ticks: lightTicks }, y: { grid: lightGrid, ticks: lightTicks } }
            }
        });
    }

    // Chart 4: Catch per Ship
    const ctxCatchPerShip = document.getElementById('chartCatchPerShip')?.getContext('2d');
    if (ctxCatchPerShip) {
        charts.catchPerShip = new Chart(ctxCatchPerShip, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    { label: '沿海單船捕撈率 (尾/艘)', data: [], borderColor: '#10b981', tension: 0.2, borderWidth: 2 },
                    { label: '深海單船捕撈率 (尾/艘)', data: [], borderColor: '#3b82f6', tension: 0.2, borderWidth: 2 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: commonPlugins,
                scales: {
                    x: { grid: lightGrid, ticks: lightTicks },
                    y: { grid: lightGrid, ticks: lightTicks, min: 0, max: 26 }
                }
            }
        });
    }
}

function updateCharts() {
    const validHistory = sim.history.filter(h => h.year > 0);
    const labels = validHistory.map(h => `Y${h.year}`);

    if (charts.fish) {
        charts.fish.data.labels = labels;
        charts.fish.data.datasets[0].data = validHistory.map(h => h.totalFish);
        charts.fish.data.datasets[1].data = validHistory.map(h => h.coastalFish);
        charts.fish.data.datasets[2].data = validHistory.map(h => h.deepSeaFish);
        charts.fish.update();
    }

    if (charts.catchFleet) {
        charts.catchFleet.data.labels = labels;
        charts.catchFleet.data.datasets[0].data = validHistory.map(h => h.totalCatch);
        charts.catchFleet.data.datasets[1].data = validHistory.map(h => h.totalShips);
        charts.catchFleet.update();
    }

    if (charts.assets) {
        charts.assets.data.labels = labels;
        charts.assets.data.datasets[0].data = validHistory.map(h => h.teamsSnapshot[0].totalAssets);
        charts.assets.data.datasets[1].data = validHistory.map(h => h.teamsSnapshot[1].totalAssets);
        charts.assets.data.datasets[2].data = validHistory.map(h => h.teamsSnapshot[2].totalAssets);
        charts.assets.data.datasets[3].data = validHistory.map(h => h.teamsSnapshot[3].totalAssets);
        charts.assets.update();
    }

    if (charts.catchPerShip) {
        charts.catchPerShip.data.labels = labels;
        charts.catchPerShip.data.datasets[0].data = validHistory.map(h => sim.calculateCatchPerShip(h.coastalFish, sim.coastal.area));
        charts.catchPerShip.data.datasets[1].data = validHistory.map(h => sim.calculateCatchPerShip(h.deepSeaFish, sim.deepSea.area));
        charts.catchPerShip.update();
    }
}

function exportCSV() {
    const validHistory = sim.history.filter(h => h.year > 0);
    if (validHistory.length === 0) {
        alert('尚無營運數據可供匯出！');
        return;
    }

    let csv = 'data:text/csv;charset=utf-8,\uFEFF';
    const headers = [
        '年度', '沿海魚量', '深海魚量', '海域總魚量', '沿海年捕撈', '深海年捕撈',
        '全球總魚獲', '沿海出海船數', '深海出海船數', '全球總船隻數',
        '玩家船數', '玩家現金', '玩家總資產',
        '阿爾法資產', '貝塔資產', '伽瑪資產'
    ];
    csv += headers.join(',') + '\r\n';

    validHistory.forEach(r => {
        const row = [
            r.year,
            r.coastalFish,
            r.deepSeaFish,
            r.totalFish,
            r.coastalCatch,
            r.deepSeaCatch,
            r.totalCatch,
            r.coastalShips,
            r.deepSeaShips,
            r.totalShips,
            r.playerShips,
            r.playerCash,
            r.playerAssets,
            r.teamsSnapshot[1].totalAssets,
            r.teamsSnapshot[2].totalAssets,
            r.teamsSnapshot[3].totalAssets
        ];
        csv += row.join(',') + '\r\n';
    });

    const encodedUri = encodeURI(csv);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `FishBanks_Simulation_Result_Y${sim.currentYear - 1}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================
// Google 試算表 (Google Apps Script Webhook) 串接模組
// ==========================================

function setupGoogleSheetsModule() {
    // 讀取 LocalStorage 既有快取設定
    const savedUrl = localStorage.getItem(STORAGE_KEY_WEBHOOK) || "";
    const savedClass = localStorage.getItem(STORAGE_KEY_CLASS) || "";
    const savedId = localStorage.getItem(STORAGE_KEY_ID) || "";
    const savedName = localStorage.getItem(STORAGE_KEY_NAME) || "";

    const elUrl = document.getElementById('inputWebhookUrl');
    const elClass = document.getElementById('inputClass');
    const elId = document.getElementById('inputId');
    const elName = document.getElementById('inputName');

    if (elUrl) elUrl.value = savedUrl;
    if (elClass) elClass.value = savedClass;
    if (elId) elId.value = savedId;
    if (elName) elName.value = savedName;

    // 綁定彈跳視窗觸發按鈕
    const btnOpenTop = document.getElementById('btnOpenSubmitModal');
    const btnOpenAction = document.getElementById('btnTriggerModal');
    const btnSubmit = document.getElementById('btnSubmitScore');

    if (btnOpenTop) btnOpenTop.addEventListener('click', openSubmitModal);
    if (btnOpenAction) btnOpenAction.addEventListener('click', openSubmitModal);
    if (btnSubmit) btnSubmit.addEventListener('click', submitToGoogleSheets);
}

function openSubmitModal() {
    const modal = document.getElementById('submitModal');
    if (!modal) return;

    const st = sim.getCurrentStatus();
    const player = st.player;
    const totalFish = st.coastal.fish + st.deepSea.fish;
    const initialFish = st.coastal.initialFish + st.deepSea.initialFish;
    const fishPct = Math.round((totalFish / initialFish) * 100);

    // 更新預覽卡片
    setText('modalSummaryYear', `第 ${Math.min(st.maxYears, st.year)} 年 (${sim.isGameOver ? '模擬已結算' : '進行中'})`);
    setText('modalSummaryAssets', `$${player.totalAssets.toLocaleString()}`);
    setText('modalSummaryFish', `${fishPct}% (${totalFish.toLocaleString()} 尾)`);
    setText('modalSummaryRegime', sim.institution.enabled ? "🛡️ 有配額管制" : "開放自由競爭");

    const msgEl = document.getElementById('submitResultMsg');
    if (msgEl) msgEl.innerHTML = '';

    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
}

function closeSubmitModal() {
    const modal = document.getElementById('submitModal');
    if (modal) modal.classList.add('hidden');
}

function toggleWebhookConfig() {
    const el = document.getElementById('inputWebhookUrl');
    if (el) {
        el.focus();
        el.select();
    }
}

function submitToGoogleSheets() {
    const elUrl = document.getElementById('inputWebhookUrl');
    const elClass = document.getElementById('inputClass');
    const elId = document.getElementById('inputId');
    const elName = document.getElementById('inputName');
    const msgEl = document.getElementById('submitResultMsg');

    const webhookUrl = elUrl ? elUrl.value.trim() : "";
    const className = elClass ? elClass.value.trim() : "";
    const studentId = elId ? elId.value.trim() : "";
    const studentName = elName ? elName.value.trim() : "";

    if (!studentId || !studentName) {
        alert("請填寫「學號」與「姓名」！");
        return;
    }

    if (!webhookUrl) {
        alert("尚未填寫 Google Apps Script Webhook 網址！\n請先依據說明在 Google 試算表完成部署並貼上網址。");
        if (elUrl) elUrl.focus();
        return;
    }

    // 儲存於 LocalStorage 方便下次免重複輸入
    localStorage.setItem(STORAGE_KEY_WEBHOOK, webhookUrl);
    localStorage.setItem(STORAGE_KEY_CLASS, className);
    localStorage.setItem(STORAGE_KEY_ID, studentId);
    localStorage.setItem(STORAGE_KEY_NAME, studentName);

    const st = sim.getCurrentStatus();
    const player = st.player;
    const totalFish = st.coastal.fish + st.deepSea.fish;
    const initialFish = st.coastal.initialFish + st.deepSea.initialFish;
    const fishPct = Math.round((totalFish / initialFish) * 100);

    // 計算當前名次
    const sortedTeams = [...st.teams].sort((a, b) => b.totalAssets - a.totalAssets);
    const finalRank = sortedTeams.findIndex(t => t.id === "player") + 1;

    // 取得所有有效年度歷程明細 (Year 1 ~ N)
    const validHistory = sim.history.filter(h => h.year > 0);

    const yearlyLogs = validHistory.map(r => ({
        year: r.year,
        // 決策變數
        coastalShips: r.playerAllocCoastal ?? 0,
        deepSeaShips: r.playerAllocDeepSea ?? 0,
        harborShips: r.playerAllocHarbor ?? 0,
        newShipsOrdered: r.playerNewShipsOrdered ?? 0,
        shipsScrapped: r.playerShipsScrapped ?? 0,
        totalFleet: r.playerFleetTotal ?? r.playerShips,

        // 狀態變數 (漁場生態與市場成本)
        coastalFishPop: r.coastalFish,
        deepSeaFishPop: r.deepSeaFish,
        totalFishPop: r.totalFish,
        coastalCatchPerShip: sim.calculateCatchPerShip(r.coastalFish, sim.coastal.area),
        deepSeaCatchPerShip: sim.calculateCatchPerShip(r.deepSeaFish, sim.deepSea.area),
        fishPrice: r.fishPrice ?? 20,
        coastalOpsCost: r.coastalOpsCostPerShip ?? 150,
        deepSeaOpsCost: r.deepSeaOpsCostPerShip ?? 250,
        harborOpsCost: r.harborOpsCostPerShip ?? 50,

        // 漁場總體與全域競爭船隊
        globalCoastalCatch: r.coastalCatch,
        globalDeepSeaCatch: r.deepSeaCatch,
        globalTotalCatch: r.totalCatch,
        globalCoastalShips: r.coastalShips,
        globalDeepSeaShips: r.deepSeaShips,
        globalTotalShips: r.totalShips,

        // 個人營運與財務明細 (營運紀錄表)
        playerCatchCoastal: r.playerCatchCoastal ?? 0,
        playerCatchDeepSea: r.playerCatchDeepSea ?? 0,
        playerCatchTotal: r.playerCatchTotal ?? 0,
        revenue: r.playerRevenue ?? 0,
        expenses: r.playerExpenses ?? 0,
        netProfit: r.playerYearlyProfit ?? 0,
        accumulatedProfit: r.playerAccumulatedProfit ?? 0,
        cash: r.playerCash,
        totalAssets: r.playerAssets,
        rank: r.playerRank ?? 1,

        // AI 競爭對手資產快照
        aiAlphaAssets: r.teamsSnapshot?.[1]?.totalAssets ?? 0,
        aiBetaAssets: r.teamsSnapshot?.[2]?.totalAssets ?? 0,
        aiGammaAssets: r.teamsSnapshot?.[3]?.totalAssets ?? 0
    }));

    const payload = {
        action: "submit_two_sheet",
        timestamp: new Date().toISOString(),
        summary: {
            className: className || "未填寫班級",
            studentId: studentId,
            studentName: studentName,
            year: Math.min(st.maxYears, st.year),
            finalAssets: player.totalAssets,
            finalCash: Math.round(player.bankBalance),
            finalShips: player.ships,
            finalRank: finalRank,
            remainingFish: totalFish,
            fishHealthPct: fishPct,
            institutionEnabled: sim.institution.enabled ? "配額管制制度" : "開放自由競爭",
            statusResult: sim.isGameOver ? (sim.isWon ? "永續冠軍" : "已結算/過度捕撈") : "進行中",
            totalLoggedYears: yearlyLogs.length
        },
        yearlyLogs: yearlyLogs
    };

    msgEl.innerHTML = `<span class="text-blue-600 flex items-center justify-center gap-1.5"><svg class="animate-spin h-3.5 w-3.5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> 正在將總結算與 ${yearlyLogs.length} 期歷程明細同步寫入 Google 雙工作表...</span>`;

    // 使用 fetch 發送 POST
    fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors', // 繞過跨網域 CORS
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    .then(() => {
        msgEl.innerHTML = `<span class="text-emerald-600 font-bold">✅ 成功！排行榜與 ${yearlyLogs.length} 期完整營運明細已寫入 Google 試算表！</span>`;
        setTimeout(() => {
            closeSubmitModal();
        }, 2500);
    })
    .catch(err => {
        msgEl.innerHTML = `<span class="text-rose-600 font-bold">❌ 傳送失敗：${err.message}，請檢查網路或 Webhook 網址。</span>`;
    });
}
