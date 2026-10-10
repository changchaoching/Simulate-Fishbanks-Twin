/**
 * FishBanks: A Renewable Resource Management Simulation
 * 核心模擬演算法與生態經濟模型 (Bio-Economic System Dynamics Engine)
 * 
 * 參考文獻與模型來源：
 * 1. Meadows, Dennis L. et al. (1993, 2001) "Building the Fish Banks Model and Renewable Resource Depletion" (MIT Sloan / System Dynamics Education Project, D-4543-2)
 * 2. Ruiz-Pérez, M. et al. (2011) "An institutional analysis of the sustainability of fisheries: Insights from FishBanks simulation game." Ocean & Coastal Management, 54(8), 585-592.
 * 3. Costello, Gaines, Lynham (2008) "Can Catch Shares Prevent Fisheries Collapse" Science.
 */

class FishBanksEngine {
    constructor() {
        this.reset();
    }

    /**
     * 重置模擬世界
     * @param {Object} customConfig 可選自訂設定
     */
    reset(customConfig = {}) {
        this.currentYear = 1;
        this.maxYears = customConfig.maxYears || 15; // 支援 10 ~ 20 年 (預設標準 15 年，Ruiz-Pérez 測試週期)
        this.isGameOver = false;
        this.gameOverReason = "";
        this.isWon = false;

        // ---- 1. 生態系統參數 (Ecological Fisheries) ----
        // 沿海漁場 (Coastal Fishery) - 較小、距離近、成本低、容易過度捕撈
        this.coastal = {
            name: "沿海漁場 (Coastal)",
            carryingCapacity: 2000,          // 環境承載量 (魚數上限)
            fish: 1000,                      // 初始魚量 (約承載量 50%，具最大再生力 MSY 附近)
            initialFish: 1000,
            area: 100,                       // 漁場面試平方英里
            operatingCostPerShip: 150,       // 每艘船/年營運成本 ($150)
            maxCatchPerShip: 25,             // 每艘船飽和捕撈量上限 (25 尾)
            totalCatchThisYear: 0,
            regenerationThisYear: 0,
            density: 10.0,                   // 魚隻密度 (fish / sq.mi)
            shipsDeployed: 0                 // 當年全體船隻部署數
        };

        // 深海遠洋 (Deep Sea Fishery) - 較大、魚量充沛、距離遠、營運成本高
        this.deepSea = {
            name: "遠洋深海 (Deep Sea)",
            carryingCapacity: 4000,          // 環境承載量 (4000 尾)
            fish: 2500,                      // 初始魚量 (約承載量 62.5%)
            initialFish: 2500,
            area: 200,
            operatingCostPerShip: 250,       // 每艘船/年營運成本 ($250)
            maxCatchPerShip: 25,             // 每艘船飽和捕撈量上限 (25 尾)
            totalCatchThisYear: 0,
            regenerationThisYear: 0,
            density: 12.5,
            shipsDeployed: 0
        };

        // 避風港/港口 (Harbor)
        this.harborOperatingCostPerShip = 50; // 停泊港口待命成本 ($50/船/年，不捕魚)

        // 市場與金融常數 (Economics)
        this.fishPrice = 20;                 // 魚價 ($20 / 尾，平穩收購價)
        this.shipBuildCost = 300;            // 新造漁船成本 ($300 / 艘)
        this.shipSalvageValue = 250;          // 船舶期末殘值 / 報廢拆解價值 ($250 / 艘)
        this.interestRatePositive = 0.08;    // 正銀行存款年利息 (8%)
        this.interestRateNegative = 0.15;    // 負債借貸年利息 (15%)

        // ---- 2. 玩家與 AI 船隊設定 (4 大漁業公司) ----
        // 經典 FishBanks 配置為 4 家商業競爭漁業公司
        this.teams = [
            {
                id: "player",
                name: "您的船隊 (Player Fleet)",
                isAI: false,
                ships: 6,                    // 初始 6 艘船
                bankBalance: 1200,           // 初始流動現金 $1,200 (Ruiz-Pérez 2011 經典配置)
                totalAssets: 1200 + (6 * 250), // 現金 + 船隻殘值 ($2,700)
                yearlyProfit: 0,
                accumulatedProfit: 0,
                allocation: { coastal: 3, deepSea: 3, harbor: 0 },
                newShipsOrdered: 0,
                shipsScrapped: 0,
                catchThisYear: { coastal: 0, deepSea: 0, total: 0 },
                revenueThisYear: 0,
                expensesThisYear: 0
            },
            {
                id: "ai_alpha",
                name: "阿爾法遠洋 (AI: 積極擴張型)",
                isAI: true,
                strategy: "aggressive",      // 大量造船、偏好深海
                ships: 6,
                bankBalance: 1200,
                totalAssets: 2700,
                yearlyProfit: 0,
                accumulatedProfit: 0,
                allocation: { coastal: 2, deepSea: 4, harbor: 0 },
                newShipsOrdered: 0,
                shipsScrapped: 0,
                catchThisYear: { coastal: 0, deepSea: 0, total: 0 },
                revenueThisYear: 0,
                expensesThisYear: 0
            },
            {
                id: "ai_beta",
                name: "貝塔水產 (AI: 沿海近海型)",
                isAI: true,
                strategy: "coastal_focus",  // 偏好沿海、成本控管
                ships: 6,
                bankBalance: 1200,
                totalAssets: 2700,
                yearlyProfit: 0,
                accumulatedProfit: 0,
                allocation: { coastal: 4, deepSea: 2, harbor: 0 },
                newShipsOrdered: 0,
                shipsScrapped: 0,
                catchThisYear: { coastal: 0, deepSea: 0, total: 0 },
                revenueThisYear: 0,
                expensesThisYear: 0
            },
            {
                id: "ai_gamma",
                name: "伽瑪漁業 (AI: 穩健平衡型)",
                isAI: true,
                strategy: "balanced",        // 視魚隻密度機動調度
                ships: 6,
                bankBalance: 1200,
                totalAssets: 2700,
                yearlyProfit: 0,
                accumulatedProfit: 0,
                allocation: { coastal: 3, deepSea: 3, harbor: 0 },
                newShipsOrdered: 0,
                shipsScrapped: 0,
                catchThisYear: { coastal: 0, deepSea: 0, total: 0 },
                revenueThisYear: 0,
                expensesThisYear: 0
            }
        ];

        // 制度與公地治理政策 (Fishery Management Institutions)
        // 根據 Ruiz-Pérez (2011) 與 Costello et al. (2008)
        this.institution = {
            enabled: false,                  // 是否開啟公地管理制度 (開放競爭 Open Access vs. 配額管制 Regulated)
            coastalQuotaPerTeam: 99,         // 每隊沿海出海船隻配額上限
            deepSeaQuotaPerTeam: 99,         // 每隊深海出海船隻配額上限
            totalFleetCap: 999,              // 全域船隻總量上限
            illegalPenaltyFee: 200           // 超額違規罰金 ($200 / 艘)
        };

        // 年度隨機拍賣會 (Auctions, Ruiz-Pérez: 第 1, 3, 5 年拍賣各 5 艘造好的即用現船)
        this.availableAuctionShips = 0;
        this.auctionHistory = [];

        // 歷史軌跡與日誌
        this.history = [];
        this.logs = [];

        this.recordHistoryInitial();
    }

    /**
     * 生態再生模型：Ricker / Logistic 曲線 (帶極度枯竭崩潰 tipping point)
     * 密度比 (Fish / CarryingCapacity)
     * 在 0.5 ~ 0.6 承載量時再生量最大 (MSY: Maximum Sustainable Yield)
     */
    calculateRegeneration(currentFish, carryingCapacity) {
        if (currentFish <= 5) return 0; // 若魚群低於 5 尾則喪失繁殖配對能力，徹底絕滅崩潰 (Critical collapse)

        const ratio = Math.max(0, currentFish / carryingCapacity);
        
        // 根據 MIT D-4543-2 查表非線性模型：
        // 淨年出生率受密度抑制 (Crowding Factor)
        // 生殖係數最高在 ratio = 0.5 左右，高密度時死亡率升高；低密度過度捕撈時，生殖幼魚不足。
        let intrinsicGrowth = 0.28; // 基準年內在增長率 28%
        
        // 增長曲線 Logistic: r * Fish * (1 - Fish/K)
        let delta = intrinsicGrowth * currentFish * (1 - ratio);

        // 如果過度枯竭 (低於承載量的 15%)，繁殖成功率呈斷崖式下跌 (Allee effect)
        if (ratio < 0.15) {
            delta *= (ratio / 0.15);
        }

        // 加上合理的氣候自然擾動 (±8%)
        const fluctuation = 1.0 + (Math.random() * 0.16 - 0.08);
        const regeneration = Math.max(0, Math.round(delta * fluctuation));
        return regeneration;
    }

    /**
     * 單船捕撈量模型 (Catch per Ship Nonlinear Lookup)
     * 來自 MIT D-4543-2:
     * 當魚隻密度高時，單船捕撈量因現代聲納與船艙容量限制在 25 尾飽和；
     * 當魚隻密度低時，尋魚成本陡升，單船捕撈量迅速下滑。
     */
    calculateCatchPerShip(fishPopulation, area) {
        if (fishPopulation <= 0) return 0;
        const density = fishPopulation / area; // 尾 / 平方英里

        // MIT D-4543-2 標準 Lookup:
        // density: 0->0, 1->5, 2->10.4, 3->15.9, 4->20.2, 5->22.1, 6->23.2, 8->24.2, 10->25
        if (density <= 0) return 0;
        if (density >= 10) return 25.0;

        const lookup = [
            [0, 0], [1, 5.0], [2, 10.4], [3, 15.9],
            [4, 20.2], [5, 22.1], [6, 23.2], [7, 23.8],
            [8, 24.2], [9, 24.6], [10, 25.0]
        ];

        // 線性插值
        for (let i = 0; i < lookup.length - 1; i++) {
            if (density >= lookup[i][0] && density <= lookup[i + 1][0]) {
                const ratio = (density - lookup[i][0]) / (lookup[i + 1][0] - lookup[i][0]);
                return lookup[i][1] + ratio * (lookup[i + 1][1] - lookup[i][1]);
            }
        }
        return 25.0;
    }

    /**
     * AI 船隊的自動決策邏輯 (包含船隻增造與出海分配)
     */
    generateAIDecisions() {
        const coastalDensity = this.coastal.fish / this.coastal.area;
        const deepSeaDensity = this.deepSea.fish / this.deepSea.area;

        this.teams.filter(t => t.isAI).forEach(ai => {
            const totalShips = ai.ships;
            let coastalTarget = 0;
            let deepSeaTarget = 0;
            let harborTarget = 0;

            // 1. 漁場分配策略
            if (ai.strategy === "aggressive") {
                // 積極型：只要深海還有魚就優先派去深海
                if (deepSeaDensity >= 3.0) {
                    deepSeaTarget = Math.round(totalShips * 0.7);
                    coastalTarget = totalShips - deepSeaTarget;
                } else if (coastalDensity >= 3.0) {
                    coastalTarget = Math.round(totalShips * 0.8);
                    deepSeaTarget = totalShips - coastalTarget;
                } else {
                    // 兩者皆枯竭，保留部分在港口避險
                    harborTarget = Math.round(totalShips * 0.4);
                    coastalTarget = Math.round(totalShips * 0.3);
                    deepSeaTarget = totalShips - harborTarget - coastalTarget;
                }
            } else if (ai.strategy === "coastal_focus") {
                // 近海專精型：以沿海為根據地，若沿海低於警戒則去深海
                if (coastalDensity >= 4.0) {
                    coastalTarget = Math.round(totalShips * 0.7);
                    deepSeaTarget = totalShips - coastalTarget;
                } else {
                    deepSeaTarget = Math.round(totalShips * 0.6);
                    coastalTarget = totalShips - deepSeaTarget;
                }
            } else {
                // 平衡型：根據兩處邊際收益比率分配
                const coastalYield = this.calculateCatchPerShip(this.coastal.fish, this.coastal.area) * this.fishPrice - this.coastal.operatingCostPerShip;
                const deepSeaYield = this.calculateCatchPerShip(this.deepSea.fish, this.deepSea.area) * this.fishPrice - this.deepSea.operatingCostPerShip;

                if (coastalYield <= 0 && deepSeaYield <= 0) {
                    // 兩邊都賠錢，退守港口
                    harborTarget = Math.round(totalShips * 0.7);
                    coastalTarget = Math.round((totalShips - harborTarget) / 2);
                    deepSeaTarget = totalShips - harborTarget - coastalTarget;
                } else if (deepSeaYield > coastalYield + 30) {
                    deepSeaTarget = Math.round(totalShips * 0.65);
                    coastalTarget = totalShips - deepSeaTarget;
                } else {
                    coastalTarget = Math.round(totalShips * 0.55);
                    deepSeaTarget = totalShips - coastalTarget;
                }
            }

            // 遵循配額管制 (若開啟制度)
            if (this.institution.enabled) {
                coastalTarget = Math.min(coastalTarget, this.institution.coastalQuotaPerTeam);
                deepSeaTarget = Math.min(deepSeaTarget, this.institution.deepSeaQuotaPerTeam);
                harborTarget = totalShips - coastalTarget - deepSeaTarget;
            }

            ai.allocation = {
                coastal: Math.max(0, coastalTarget),
                deepSea: Math.max(0, deepSeaTarget),
                harbor: Math.max(0, harborTarget)
            };

            // 2. 船隻造船投資策略 (造新船：成本 $300)
            ai.newShipsOrdered = 0;
            ai.shipsScrapped = 0;

            // 若手頭現金充裕 (超過 $900) 且平均單船有獲利，則擴建船隊
            const avgFishAbundance = (this.coastal.fish / this.coastal.carryingCapacity + this.deepSea.fish / this.deepSea.carryingCapacity) / 2;
            if (ai.bankBalance >= 900 && avgFishAbundance > 0.4 && (!this.institution.enabled || ai.ships < (this.institution.coastalQuotaPerTeam + this.institution.deepSeaQuotaPerTeam))) {
                ai.newShipsOrdered = Math.min(2, Math.floor((ai.bankBalance - 600) / this.shipBuildCost));
            } else if (ai.bankBalance < -500 && ai.ships > 3) {
                // 嚴重負債時賣船償債
                ai.shipsScrapped = 1;
            }
        });
    }

    /**
     * 執行一年經營週期
     * @param {Object} playerDecisions 玩家決策 { allocation: {coastal, deepSea, harbor}, newShipsOrdered, shipsScrapped }
     */
    step(playerDecisions) {
        if (this.isGameOver) return;

        const player = this.teams.find(t => !t.isAI);

        // 1. 驗證與套用玩家決策
        let pCoastal = Math.max(0, parseInt(playerDecisions.allocation?.coastal || 0));
        let pDeepSea = Math.max(0, parseInt(playerDecisions.allocation?.deepSea || 0));
        let pHarbor = Math.max(0, parseInt(playerDecisions.allocation?.harbor || 0));

        // 確保總出海船隻不超過現有總船數
        const totalDeployed = pCoastal + pDeepSea + pHarbor;
        if (totalDeployed > player.ships) {
            // 自動平攤或優先縮減
            pCoastal = Math.min(pCoastal, player.ships);
            pDeepSea = Math.min(pDeepSea, player.ships - pCoastal);
            pHarbor = player.ships - pCoastal - pDeepSea;
        } else if (totalDeployed < player.ships) {
            // 剩餘船隻預設停留在港口
            pHarbor = player.ships - pCoastal - pDeepSea;
        }

        player.allocation = { coastal: pCoastal, deepSea: pDeepSea, harbor: pHarbor };
        player.newShipsOrdered = Math.max(0, parseInt(playerDecisions.newShipsOrdered || 0));
        player.shipsScrapped = Math.max(0, Math.min(player.ships, parseInt(playerDecisions.shipsScrapped || 0)));

        // 2. 觸發 AI 決策
        this.generateAIDecisions();

        // 3. 匯總全體船隊在兩大漁場的捕撈實力
        let totalCoastalShips = 0;
        let totalDeepSeaShips = 0;
        this.teams.forEach(t => {
            totalCoastalShips += t.allocation.coastal;
            totalDeepSeaShips += t.allocation.deepSea;
        });

        this.coastal.shipsDeployed = totalCoastalShips;
        this.deepSea.shipsDeployed = totalDeepSeaShips;

        // 4. 計算單船基礎捕撈量 (Catch per ship)
        const coastalCatchRate = this.calculateCatchPerShip(this.coastal.fish, this.coastal.area);
        const deepSeaCatchRate = this.calculateCatchPerShip(this.deepSea.fish, this.deepSea.area);

        // 計算漁場總預期捕撈量
        const totalDesiredCoastalCatch = totalCoastalShips * coastalCatchRate;
        const totalDesiredDeepSeaCatch = totalDeepSeaShips * deepSeaCatchRate;

        // 實際總捕撈量受限於海中現有總魚量 (不可捕超過現有魚數)
        const actualCoastalCatch = Math.min(this.coastal.fish, Math.round(totalDesiredCoastalCatch));
        const actualDeepSeaCatch = Math.min(this.deepSea.fish, Math.round(totalDesiredDeepSeaCatch));

        this.coastal.totalCatchThisYear = actualCoastalCatch;
        this.deepSea.totalCatchThisYear = actualDeepSeaCatch;

        // 5. 將魚獲按出海船數比例分配給各船隊，並結算營收與營運成本
        this.teams.forEach(t => {
            // 捕獲分配
            const myCoastalCatch = totalCoastalShips > 0 
                ? Math.round(actualCoastalCatch * (t.allocation.coastal / totalCoastalShips)) 
                : 0;
            const myDeepSeaCatch = totalDeepSeaShips > 0 
                ? Math.round(actualDeepSeaCatch * (t.allocation.deepSea / totalDeepSeaShips)) 
                : 0;

            t.catchThisYear = {
                coastal: myCoastalCatch,
                deepSea: myDeepSeaCatch,
                total: myCoastalCatch + myDeepSeaCatch
            };

            // 營業收入
            t.revenueThisYear = t.catchThisYear.total * this.fishPrice;

            // 船隊營運成本 (依部署海域計費)
            const coastalOpsCost = t.allocation.coastal * this.coastal.operatingCostPerShip;
            const deepSeaOpsCost = t.allocation.deepSea * this.deepSea.operatingCostPerShip;
            const harborOpsCost = t.allocation.harbor * this.harborOperatingCostPerShip;
            let myExpenses = coastalOpsCost + deepSeaOpsCost + harborOpsCost;

            // 制度罰金 (若有違規超額出海)
            if (this.institution.enabled) {
                if (t.allocation.coastal > this.institution.coastalQuotaPerTeam) {
                    myExpenses += (t.allocation.coastal - this.institution.coastalQuotaPerTeam) * this.institution.illegalPenaltyFee;
                }
                if (t.allocation.deepSea > this.institution.deepSeaQuotaPerTeam) {
                    myExpenses += (t.allocation.deepSea - this.institution.deepSeaQuotaPerTeam) * this.institution.illegalPenaltyFee;
                }
            }

            // 造船支出與拆船收入 (當期現金結算)
            const buildExpense = t.newShipsOrdered * this.shipBuildCost;
            const scrapRevenue = t.shipsScrapped * this.shipSalvageValue;

            // 銀行利息 (根據期初現金餘額結算)
            let interestAmount = 0;
            if (t.bankBalance >= 0) {
                interestAmount = Math.round(t.bankBalance * this.interestRatePositive);
            } else {
                interestAmount = Math.round(t.bankBalance * this.interestRateNegative); // 負數代表利息支出
            }

            // 本年度利潤與現金增減
            t.expensesThisYear = myExpenses + buildExpense;
            t.yearlyProfit = (t.revenueThisYear + scrapRevenue + interestAmount) - (myExpenses + buildExpense);
            t.accumulatedProfit += t.yearlyProfit;

            // 更新現金
            t.bankBalance += (t.revenueThisYear + scrapRevenue + interestAmount) - (myExpenses + buildExpense);

            // 更新船隊規模 (新船於下一年度投入營運)
            t.ships = t.ships - t.shipsScrapped + t.newShipsOrdered;

            // 計算期末總資產 (Total Assets = 銀行存款 + 船隻殘值)
            t.totalAssets = Math.round(t.bankBalance + (t.ships * this.shipSalvageValue));
        });

        // 6. 更新漁場生態庫存 (先扣除捕撈，再繁衍生長)
        this.coastal.fish = Math.max(0, this.coastal.fish - actualCoastalCatch);
        this.deepSea.fish = Math.max(0, this.deepSea.fish - actualDeepSeaCatch);

        const coastalRegen = this.calculateRegeneration(this.coastal.fish, this.coastal.carryingCapacity);
        const deepSeaRegen = this.calculateRegeneration(this.deepSea.fish, this.deepSea.carryingCapacity);

        this.coastal.regenerationThisYear = coastalRegen;
        this.deepSea.regenerationThisYear = deepSeaRegen;

        this.coastal.fish = Math.min(this.coastal.carryingCapacity, this.coastal.fish + coastalRegen);
        this.deepSea.fish = Math.min(this.deepSea.carryingCapacity, this.deepSea.fish + deepSeaRegen);

        this.coastal.density = Math.round((this.coastal.fish / this.coastal.area) * 10) / 10;
        this.deepSea.density = Math.round((this.deepSea.fish / this.deepSea.area) * 10) / 10;

        // 7. 判定生態枯竭與破產危機
        const totalRemainingFish = this.coastal.fish + this.deepSea.fish;
        const totalInitialFish = this.coastal.initialFish + this.deepSea.initialFish;

        if (totalRemainingFish <= 50) {
            this.isGameOver = true;
            this.isWon = false;
            this.gameOverReason = `【海洋公地徹底崩潰 (Tragedy of the Commons)】在第 ${this.currentYear} 年，沿海與深海魚群遭四國船隊過度捕撈至滅絕邊緣（全海域僅剩 ${totalRemainingFish} 尾魚）！魚群喪失自我繁衍能力，全球漁業徹底崩解！`;
        } else if (player.bankBalance < -3000) {
            this.isGameOver = true;
            this.isWon = false;
            this.gameOverReason = `【船隊宣告破產】在第 ${this.currentYear} 年，您的流動現金虧損達 $${Math.round(player.bankBalance).toLocaleString()}，巨額高利貸負債利息壓垮了船隊營運，無力支付碼頭作業費，被迫宣告清算倒閉！`;
        } else if (this.currentYear >= this.maxYears) {
            this.isGameOver = true;
            // 比較資產排名
            const sorted = [...this.teams].sort((a, b) => b.totalAssets - a.totalAssets);
            const playerRank = sorted.findIndex(t => t.id === "player") + 1;
            this.isWon = playerRank === 1 && totalRemainingFish > (totalInitialFish * 0.4);

            const fishHealth = Math.round((totalRemainingFish / totalInitialFish) * 100);
            if (this.isWon) {
                this.gameOverReason = `【達成永續捕撈冠軍 (Champion)】完成 ${this.maxYears} 年營運！您以總資產 $${player.totalAssets.toLocaleString()} 榮登第一名，且全海域魚群保有 ${fishHealth}% 良好存量，兼顧了經濟獲利與海洋生態永續！`;
            } else {
                this.gameOverReason = `【完成 ${this.maxYears} 年營運挑戰】您的總資產為 $${player.totalAssets.toLocaleString()}（排名第 ${playerRank} 名）。海域剩餘魚群率為 ${fishHealth}%。${fishHealth < 20 ? '警訊：海域已嚴重過度捕撈！' : '整體生態維持在平衡區間。'}`;
            }
        }

        // 8. 記錄歷史日誌
        this.recordHistory();

        // 推進年度
        this.currentYear++;
    }

    recordHistoryInitial() {
        this.history.push({
            year: 0,
            coastalFish: this.coastal.fish,
            deepSeaFish: this.deepSea.fish,
            totalFish: this.coastal.fish + this.deepSea.fish,
            coastalCatch: 0,
            deepSeaCatch: 0,
            totalCatch: 0,
            coastalShips: 0,
            deepSeaShips: 0,
            totalShips: this.teams.reduce((acc, t) => acc + t.ships, 0),
            playerAssets: this.teams[0].totalAssets,
            playerCash: this.teams[0].bankBalance,
            playerShips: this.teams[0].ships,
            teamsSnapshot: JSON.parse(JSON.stringify(this.teams))
        });
    }

    recordHistory() {
        const totalRemainingFish = this.coastal.fish + this.deepSea.fish;
        const totalShips = this.teams.reduce((acc, t) => acc + t.ships, 0);
        const player = this.teams.find(t => !t.isAI);

        // 4 隊排行快照
        const sortedTeams = [...this.teams].sort((a, b) => b.totalAssets - a.totalAssets);
        const playerRank = sortedTeams.findIndex(t => t.id === "player") + 1;

        const record = {
            year: this.currentYear,
            // 狀態變數 (生態與市場)
            coastalFish: this.coastal.fish,
            deepSeaFish: this.deepSea.fish,
            totalFish: totalRemainingFish,
            coastalDensity: this.coastal.density,
            deepSeaDensity: this.deepSea.density,
            fishPrice: this.fishPrice,
            coastalOpsCostPerShip: this.coastal.operatingCostPerShip,
            deepSeaOpsCostPerShip: this.deepSea.operatingCostPerShip,
            harborOpsCostPerShip: this.harborOperatingCostPerShip,
            shipBuildCost: this.shipBuildCost,
            shipSalvageValue: this.shipSalvageValue,
            
            // 漁場總體狀態
            coastalCatch: this.coastal.totalCatchThisYear,
            deepSeaCatch: this.deepSea.totalCatchThisYear,
            totalCatch: this.coastal.totalCatchThisYear + this.deepSea.totalCatchThisYear,
            coastalShips: this.coastal.shipsDeployed,
            deepSeaShips: this.deepSea.shipsDeployed,
            totalShips: totalShips,

            // 玩家決策變數
            playerAllocCoastal: player.allocation.coastal,
            playerAllocDeepSea: player.allocation.deepSea,
            playerAllocHarbor: player.allocation.harbor,
            playerNewShipsOrdered: player.newShipsOrdered,
            playerShipsScrapped: player.shipsScrapped,
            playerFleetTotal: player.ships,

            // 玩家營運與財務明細變數
            playerCatchCoastal: player.catchThisYear.coastal,
            playerCatchDeepSea: player.catchThisYear.deepSea,
            playerCatchTotal: player.catchThisYear.total,
            playerRevenue: player.revenueThisYear,
            playerExpenses: player.expensesThisYear,
            playerYearlyProfit: player.yearlyProfit,
            playerAccumulatedProfit: player.accumulatedProfit,
            playerCash: Math.round(player.bankBalance),
            playerAssets: player.totalAssets,
            playerRank: playerRank,

            // 四大船隊資產快照
            teamsSnapshot: JSON.parse(JSON.stringify(this.teams))
        };

        this.history.push(record);
        this.logs.unshift(record);
    }

    getCurrentStatus() {
        return {
            year: this.currentYear,
            maxYears: this.maxYears,
            coastal: this.coastal,
            deepSea: this.deepSea,
            teams: this.teams,
            player: this.teams.find(t => !t.isAI),
            institution: this.institution,
            isGameOver: this.isGameOver,
            isWon: this.isWon,
            gameOverReason: this.gameOverReason
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FishBanksEngine;
}
