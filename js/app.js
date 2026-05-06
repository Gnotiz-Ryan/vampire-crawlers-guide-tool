// Vampire Crawlers 卡牌合成工具 - 主逻辑

(function () {
  "use strict";

  // === 工具函数 ===
  function getCard(id) {
    return CARDS.find(c => c.id === id);
  }

  function getRecipesForCard(cardId) {
    return RECIPES.filter(r => r.result === cardId);
  }

  function getRecipesUsingCard(cardId) {
    return RECIPES.filter(r => {
      if (r.materials.includes(cardId)) return true;
      if (r.alternatives) {
        for (const key in r.alternatives) {
          const alts = r.alternatives[key];
          if (Array.isArray(alts) && alts.includes(cardId)) return true;
        }
      }
      return false;
    });
  }

  // 拼音首字母匹配
  function matchPinyin(cardId, query) {
    const py = PINYIN_MAP[cardId];
    return py && py.includes(query);
  }

  // 搜索匹配（中文名 + 英文id + 拼音首字母）
  function matchSearch(card, query) {
    if (!query) return true;
    if (card.name.includes(query) || card.id.includes(query)) return true;
    return matchPinyin(card.id, query);
  }

  // 搜索匹配配方（成品名、材料名、拼音）
  function matchRecipe(recipe, query) {
    if (!query) return false;
    const result = getCard(recipe.result);
    if (result && matchSearch(result, query)) return true;
    for (const matId of recipe.materials) {
      const mat = getCard(matId);
      if (mat && matchSearch(mat, query)) return true;
    }
    if (recipe.alternatives) {
      for (const key in recipe.alternatives) {
        const alts = recipe.alternatives[key];
        if (Array.isArray(alts)) {
          for (const altId of alts) {
            const alt = getCard(altId);
            if (alt && matchSearch(alt, query)) return true;
          }
        }
      }
    }
    return false;
  }

  // 构建迷你卡牌 HTML
  function buildMiniCard(cardId, card, count) {
    return `
      <div class="mini-card" data-card-id="${cardId}">
        <div class="mini-placeholder" style="display:none">🃏</div>
        <img src="${card.image}" alt="${card.name}" style="width:32px;height:32px;object-fit:contain;image-rendering:pixelated;"
             onerror="this.style.display='none';this.previousElementSibling.style.display='flex';">
        ${count > 1 ? `<div class="mini-count">x${count}</div>` : ""}
        <div class="mini-name">${card.name}</div>
      </div>`;
  }

  // 图片加载失败时显示占位符
  function createCardImage(card, size) {
    const wrapper = document.createElement("div");
    wrapper.style.position = "relative";
    wrapper.style.width = size + "px";
    wrapper.style.height = size + "px";
    wrapper.style.margin = "0 auto";

    const img = document.createElement("img");
    img.src = card.image;
    img.alt = card.name;
    img.style.width = size + "px";
    img.style.height = size + "px";
    img.style.objectFit = "contain";
    img.style.imageRendering = "pixelated";

    const placeholder = document.createElement("div");
    placeholder.className = "card-img-placeholder";
    placeholder.style.width = size + "px";
    placeholder.style.height = size + "px";
    placeholder.style.display = "none";
    placeholder.textContent = "🃏";

    img.onerror = function () {
      img.style.display = "none";
      placeholder.style.display = "flex";
    };

    wrapper.appendChild(placeholder);
    wrapper.appendChild(img);
    return wrapper;
  }

  // === 动态提取分类列表 ===
  function getCategories() {
    const cats = new Set();
    CARDS.forEach(c => { if (c.category) cats.add(c.category); });
    return Array.from(cats);
  }

  // === 动态提取法力消耗列表 ===
  function getManaCosts() {
    const costs = new Set();
    CARDS.forEach(c => { if (c.stats && c.stats.mana !== undefined) costs.add(String(c.stats.mana)); });
    return Array.from(costs).sort((a, b) => {
      if (a === "W") return 1;
      if (b === "W") return -1;
      return Number(a) - Number(b);
    });
  }

  // === 状态 ===
  let currentSearch = "";
  let currentCategory = "全部";
  let currentManaCost = "全部";
  let currentUnlockCategory = "全部";
  let currentGemRarity = "全部";
  let currentTab = "cards"; // "cards" | "recipes" | "gems" | "unlocks"
  let currentViewMode = "grid"; // "grid" | "list"
  const rendered = { cards: false, recipes: false, gems: false, unlocks: false };

  // === 隐藏所有标签页 ===
  function hideAllSections() {
    document.getElementById("cardsSection").style.display = "none";
    document.getElementById("recipesSection").style.display = "none";
    document.getElementById("gemsSection").style.display = "none";
    document.getElementById("unlocksSection").style.display = "none";
    document.getElementById("globalSearchSection").style.display = "none";
    document.getElementById("filterBar").style.display = "none";
    document.getElementById("manaFilterBar").style.display = "none";
  }

  // === 选项卡切换 ===
  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    if (currentSearch) {
      renderGlobalSearch();
      return;
    }
    hideAllSections();
    document.getElementById("cardsSection").style.display = tab === "cards" ? "block" : "none";
    document.getElementById("recipesSection").style.display = tab === "recipes" ? "block" : "none";
    document.getElementById("gemsSection").style.display = tab === "gems" ? "block" : "none";
    document.getElementById("unlocksSection").style.display = tab === "unlocks" ? "block" : "none";
    document.getElementById("filterBar").style.display = (tab === "cards" || tab === "gems" || tab === "unlocks") ? "flex" : "none";
    document.getElementById("manaFilterBar").style.display = tab === "cards" ? "flex" : "none";
    if (tab === "cards") {
      renderFilterBar();
      if (!rendered.cards) { renderCardGrid(); rendered.cards = true; }
    } else if (tab === "recipes") {
      if (!rendered.recipes) { renderCraftingSection(); rendered.recipes = true; }
    } else if (tab === "gems") {
      renderGemFilterBar();
      if (!rendered.gems) { renderGemsSection(); rendered.gems = true; }
    } else if (tab === "unlocks") {
      renderUnlockFilterBar();
      if (!rendered.unlocks) { renderUnlocksSection(); rendered.unlocks = true; }
    }
  }

  function initTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });
  }

  function initViewToggle() {
    document.querySelectorAll(".view-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        currentViewMode = btn.dataset.view;
        document.querySelectorAll(".view-btn").forEach(b => b.classList.toggle("active", b === btn));
        rendered.cards = false;
        renderCardGrid();
        rendered.cards = true;
      });
    });
  }

  // === 渲染筛选标签 ===
  function renderFilterBar() {
    const catBar = document.getElementById("filterBar");
    catBar.innerHTML = "";
    const categories = ["全部", ...getCategories()];
    categories.forEach(cat => {
      const tag = document.createElement("button");
      tag.className = "filter-tag" + (cat === currentCategory ? " active" : "");
      tag.textContent = cat;
      tag.addEventListener("click", () => {
        currentCategory = cat;
        rendered.cards = false;
        renderFilterBar();
        renderCardGrid();
        rendered.cards = true;
      });
      catBar.appendChild(tag);
    });

    const manaBar = document.getElementById("manaFilterBar");
    manaBar.innerHTML = "";
    const manaCosts = ["全部", ...getManaCosts()];
    manaCosts.forEach(cost => {
      const tag = document.createElement("button");
      tag.className = "filter-tag" + (cost === currentManaCost ? " active" : "");
      tag.textContent = cost === "全部" ? "全部费用" : cost === "W" ? "Wild" : cost + "费";
      tag.addEventListener("click", () => {
        currentManaCost = cost;
        rendered.cards = false;
        renderFilterBar();
        renderCardGrid();
        rendered.cards = true;
      });
      manaBar.appendChild(tag);
    });
  }

  // === 渲染卡牌网格 ===
  function renderCardGrid() {
    const grid = document.getElementById("cardGrid");
    grid.innerHTML = "";
    grid.classList.toggle("list-view", currentViewMode === "list");

    let filtered = CARDS.filter(c => {
      return matchSearch(c, currentSearch)
        && (currentCategory === "全部" || c.category === currentCategory)
        && (currentManaCost === "全部" || (c.stats && String(c.stats.mana) === currentManaCost));
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">🔍</div><div>没有找到匹配的卡牌</div></div>`;
    } else {
      filtered.forEach(card => {
        const el = document.createElement("div");
        el.className = "card-item rarity-" + (card.rarity || "common");
        el.addEventListener("click", () => openModal(card.id));
        el.appendChild(createCardImage(card, 80));

        // 列表视图：将名称、属性、可合成放入左侧内容区
        const isListView = currentViewMode === "list";
        const infoEl = isListView ? document.createElement("div") : null;
        if (isListView) {
          infoEl.className = "card-info";
          el.appendChild(infoEl);
        }
        const parent = isListView ? infoEl : el;

        const nameEl = document.createElement("div");
        nameEl.className = "card-name";
        nameEl.textContent = card.name;
        parent.appendChild(nameEl);

        if (card.stats) {
          const statsEl = document.createElement("div");
          statsEl.style.cssText = "font-size:10px;color:#aa8866;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          const parts = [];
          if (card.stats.attack) parts.push("攻" + card.stats.attack);
          if (card.stats.special) parts.push(card.stats.special);
          statsEl.textContent = parts.join(" | ");
          parent.appendChild(statsEl);
        }

        // 列表视图：显示合成配方
        const usages = getRecipesUsingCard(card.id);
        if (usages.length > 0) {
          const usageEl = document.createElement("div");
          usageEl.className = "card-usage";
          usageEl.textContent = usages.map(r => {
            const resultName = getCard(r.result)?.name || r.result;
            return (r.note || "???") + " → " + resultName;
          }).join(" | ");
          parent.appendChild(usageEl);
        }

        // 右侧：费用、稀有度、分类
        const manaCost = card.stats ? card.stats.mana : undefined;
        if (manaCost !== undefined) {
          const manaEl = document.createElement("span");
          const manaText = manaCost === "W" ? "Wild" : manaCost + "费";
          const manaColor = manaCost === "W" ? "#d4a017" : "#4fc3f7";
          manaEl.style.cssText = `background:${manaColor}22;color:${manaColor};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;flex-shrink:0;white-space:nowrap;`;
          manaEl.textContent = manaText;
          el.appendChild(manaEl);
        }

        const catEl = document.createElement("span");
        catEl.className = "card-category";
        catEl.textContent = card.category || "";
        el.appendChild(catEl);

        grid.appendChild(el);
      });
    }

    updateStats(filtered.length);
  }

  // === 构建配方卡片 ===
  function buildRecipeCard(recipe) {
    const resultCard = getCard(recipe.result);
    const el = document.createElement("div");
    el.className = "recipe-card";

    const materialsDiv = document.createElement("div");
    materialsDiv.className = "recipe-materials";
    renderRecipeMaterials(recipe, materialsDiv, 36);
    el.appendChild(materialsDiv);

    const arrow = document.createElement("div");
    arrow.className = "recipe-arrow";
    arrow.textContent = "→";
    el.appendChild(arrow);

    if (resultCard) {
      const resultDiv = document.createElement("div");
      resultDiv.className = "recipe-result";
      resultDiv.addEventListener("click", (e) => { e.stopPropagation(); openModal(recipe.result); });
      resultDiv.appendChild(createCardImage(resultCard, 44));
      const resultName = document.createElement("div");
      resultName.className = "result-name";
      resultName.textContent = resultCard.name;
      resultDiv.appendChild(resultName);
      el.appendChild(resultDiv);
    }

    if (recipe.note) {
      const noteEl = document.createElement("div");
      noteEl.style.cssText = "font-size:10px;color:#776655;margin-top:4px;max-width:100%;text-align:center;";
      noteEl.textContent = recipe.note;
      el.appendChild(noteEl);
    }

    return el;
  }

  // === 更新统计栏 ===
  function updateStats(visibleCount) {
    const statsEl = document.getElementById("statsBar");
    if (!statsEl) return;
    if (currentTab === "cards") {
      statsEl.innerHTML = `
        <div class="stat-item"><strong>${CARDS.length}</strong> 张卡牌</div>
        <div class="stat-item">当前显示 <strong>${visibleCount}</strong> 张</div>
      `;
    } else if (currentTab === "recipes") {
      statsEl.innerHTML = `
        <div class="stat-item"><strong>${RECIPES.length}</strong> 个合成配方</div>
      `;
    } else if (currentTab === "gems") {
      statsEl.innerHTML = `
        <div class="stat-item"><strong>${GEMS.length}</strong> 颗宝石</div>
        <div class="stat-item">当前显示 <strong>${visibleCount}</strong> 颗</div>
      `;
    } else if (currentTab === "unlocks") {
      statsEl.innerHTML = `
        <div class="stat-item"><strong>${UNLOCKS.length}</strong> 个解锁项</div>
        <div class="stat-item">当前显示 <strong>${visibleCount}</strong> 个</div>
      `;
    }
  }

  // === 渲染配方材料 ===
  function createMaterialEl(matId, size, onClick) {
    const matCard = getCard(matId);
    if (!matCard) return null;
    const matEl = document.createElement("div");
    matEl.className = "recipe-material";
    if (onClick) matEl.addEventListener("click", onClick);
    matEl.appendChild(createCardImage(matCard, size));
    return matEl;
  }

  function renderRecipeMaterials(recipe, container, size) {
    const alts = recipe.alternatives || {};
    recipe.materials.forEach(matId => {
      if (alts[matId] && Array.isArray(alts[matId])) {
        const group = document.createElement("div");
        group.style.cssText = "display:flex;align-items:center;gap:2px;";
        alts[matId].forEach((altId, i) => {
          if (i > 0) { const s = document.createElement("span"); s.style.cssText="font-size:10px;color:#c62828;margin:0 1px;"; s.textContent="/"; group.appendChild(s); }
          const el = createMaterialEl(altId, size, (e) => { e.stopPropagation(); openModal(altId); });
          if (el) group.appendChild(el);
        });
        container.appendChild(group);
      } else if (alts.passive && matId === recipe.materials[recipe.materials.length - 1] && !getCard(matId)) {
        const group = document.createElement("div");
        group.style.cssText = "display:flex;align-items:center;gap:2px;";
        alts.passive.forEach((altId, i) => {
          if (i > 0) { const s = document.createElement("span"); s.style.cssText="font-size:10px;color:#c62828;margin:0 1px;"; s.textContent="/"; group.appendChild(s); }
          const el = createMaterialEl(altId, size, (e) => { e.stopPropagation(); openModal(altId); });
          if (el) group.appendChild(el);
        });
        container.appendChild(group);
      } else {
        const matEl = createMaterialEl(matId, size, (e) => { e.stopPropagation(); openModal(matId); });
        if (matEl) {
          const count = recipe.count[matId] || 1;
          const countEl = document.createElement("div");
          countEl.className = "mat-count";
          countEl.textContent = "x" + count;
          matEl.appendChild(countEl);
          container.appendChild(matEl);
        }
      }
    });
    if (alts.passive && recipe.materials.every(m => getCard(m))) {
      const group = document.createElement("div");
      group.style.cssText = "display:flex;align-items:center;gap:2px;";
      alts.passive.forEach((altId, i) => {
        if (i > 0) { const s = document.createElement("span"); s.style.cssText="font-size:10px;color:#c62828;margin:0 1px;"; s.textContent="/"; group.appendChild(s); }
        const el = createMaterialEl(altId, size, (e) => { e.stopPropagation(); openModal(altId); });
        if (el) group.appendChild(el);
      });
      container.appendChild(group);
    }
  }

  // === 渲染合成表选项卡 ===
  function renderCraftingSection() {
    const container = document.getElementById("recipeList");
    container.innerHTML = "";
    if (RECIPES.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div>暂无合成配方</div></div>';
      return;
    }
    RECIPES.forEach(recipe => {
      container.appendChild(buildRecipeCard(recipe));
    });
    updateStats(RECIPES.length);
  }

  // === 解锁项分类 ===
  function getUnlockCategories() {
    const cats = new Set();
    UNLOCKS.forEach(u => { if (u.category) cats.add(u.category); });
    const arr = Array.from(cats);
    // 奥术放到第二个（全部后面）
    const idx = arr.indexOf("奥术");
    if (idx !== -1) {
      arr.splice(idx, 1);
      arr.splice(1, 0, "奥术");
    }
    return arr;
  }

  // === 渲染解锁项筛选栏 ===
  function renderUnlockFilterBar() {
    const bar = document.getElementById("filterBar");
    bar.innerHTML = "";
    const categories = ["全部", ...getUnlockCategories()];
    categories.forEach(cat => {
      const tag = document.createElement("button");
      tag.className = "filter-tag" + (cat === currentUnlockCategory ? " active" : "") + (cat === "奥术" ? " filter-tag-arcana" : "");
      tag.textContent = cat;
      tag.addEventListener("click", () => {
        currentUnlockCategory = cat;
        rendered.unlocks = false;
        renderUnlockFilterBar();
        renderUnlocksSection();
        rendered.unlocks = true;
      });
      bar.appendChild(tag);
    });
  }

  // === 渲染解锁项选项卡 ===
  function renderUnlocksSection() {
    const grid = document.getElementById("unlockGrid");
    grid.innerHTML = "";

    // Show unlock filter bar, hide card filters
    document.getElementById("filterBar").style.display = "flex";
    document.getElementById("manaFilterBar").style.display = "none";
    renderUnlockFilterBar();

    let filtered = UNLOCKS.filter(u => {
      const matchCat = currentUnlockCategory === "全部" || u.category === currentUnlockCategory;
      const matchSearch = !currentSearch
        || u.name.toLowerCase().includes(currentSearch)
        || (u.nameEn && u.nameEn.toLowerCase().includes(currentSearch))
        || u.description.toLowerCase().includes(currentSearch)
        || (u.unlocks && u.unlocks.toLowerCase().includes(currentSearch))
        || u.id.includes(currentSearch)
        || (UNLOCK_PINYIN_MAP[u.id] && UNLOCK_PINYIN_MAP[u.id].includes(currentSearch));
      return matchCat && matchSearch;
    });

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">🔍</div><div>没有找到匹配的解锁项</div></div>';
    } else {
      filtered.forEach(unlock => {
        const el = document.createElement("div");
        el.className = "unlock-item";

        // Image with fallback
        const img = document.createElement("img");
        img.src = unlock.image;
        img.alt = unlock.name;
        const placeholder = document.createElement("div");
        placeholder.className = "unlock-placeholder";
        placeholder.textContent = "🔓";
        placeholder.style.display = "none";
        img.onerror = function() { img.style.display = "none"; placeholder.style.display = "flex"; };
        el.appendChild(placeholder);
        el.appendChild(img);

        // Info
        const info = document.createElement("div");
        info.className = "unlock-info";
        const nameEl = document.createElement("div");
        nameEl.className = "unlock-name";
        nameEl.textContent = unlock.name;
        info.appendChild(nameEl);
        if (unlock.nameEn && unlock.nameEn !== unlock.name) {
          const nameEnEl = document.createElement("div");
          nameEnEl.className = "unlock-name-en";
          nameEnEl.textContent = unlock.nameEn;
          info.appendChild(nameEnEl);
        }
        const descEl = document.createElement("div");
        descEl.className = "unlock-desc";
        descEl.textContent = unlock.description;
        info.appendChild(descEl);
        if (unlock.unlocks) {
          const unlocksEl = document.createElement("div");
          unlocksEl.className = "unlock-reward";
          unlocksEl.textContent = unlock.unlocks;
          info.appendChild(unlocksEl);
        }
        el.appendChild(info);

        // Category badge
        const catEl = document.createElement("span");
        catEl.className = "unlock-cat";
        catEl.textContent = unlock.category;
        el.appendChild(catEl);

        grid.appendChild(el);
      });
    }

    updateStats(filtered.length);
  }

  // === 宝石稀有度列表 ===
  function getGemRarities() {
    const rarities = new Set();
    GEMS.forEach(g => { if (g.rarity) rarities.add(g.rarity); });
    return Array.from(rarities);
  }

  // === 渲染宝石筛选栏 ===
  const RARITY_CN = { 'Common': '普通', 'Uncommon': '罕见', 'Rare': '稀有', 'Very Rare': '史诗', 'Ultra Rare': '传说' };
  const RARITY_ORDER = { 'Ultra Rare': 0, 'Very Rare': 1, 'Rare': 2, 'Uncommon': 3, 'Common': 4 };
  const RARITY_BORDER = { 'Common': '#9e9e9e', 'Uncommon': '#4caf50', 'Rare': '#2196f3', 'Very Rare': '#9c27b0', 'Ultra Rare': '#ffd700' };

  function renderGemFilterBar() {
    const bar = document.getElementById("filterBar");
    bar.innerHTML = "";
    const sorted = getGemRarities().sort((a, b) => (RARITY_ORDER[a] ?? 5) - (RARITY_ORDER[b] ?? 5));
    const rarities = ["全部", ...sorted];
    rarities.forEach(r => {
      const tag = document.createElement("button");
      tag.className = "filter-tag" + (r === currentGemRarity ? " active" : "");
      tag.textContent = r === "全部" ? "全部" : (RARITY_CN[r] || r);
      // 非激活状态也显示稀有度颜色
      if (r !== "全部" && r !== currentGemRarity) {
        const c = RARITY_BORDER[r];
        if (c) {
          tag.style.borderColor = c + '66';
          tag.style.color = c;
        }
      }
      tag.addEventListener("click", () => {
        currentGemRarity = r;
        rendered.gems = false;
        renderGemFilterBar();
        renderGemsSection();
        rendered.gems = true;
      });
      bar.appendChild(tag);
    });
  }

  // === 渲染宝石选项卡 ===
  function renderGemsSection() {
    const grid = document.getElementById("gemGrid");
    grid.innerHTML = "";

    document.getElementById("filterBar").style.display = "flex";
    document.getElementById("manaFilterBar").style.display = "none";
    renderGemFilterBar();

    let filtered = GEMS.filter(g => {
      const matchRarity = currentGemRarity === "全部" || g.rarity === currentGemRarity;
      const matchSearch = !currentSearch
        || g.name.toLowerCase().includes(currentSearch)
        || g.effect.toLowerCase().includes(currentSearch)
        || g.id.includes(currentSearch)
        || (GEM_PINYIN_MAP[g.id] && GEM_PINYIN_MAP[g.id].includes(currentSearch));
      return matchRarity && matchSearch;
    });

    // 按稀有度排序（传说→史诗→稀有→罕见→普通）
    filtered.sort((a, b) => (RARITY_ORDER[a.rarity] ?? 5) - (RARITY_ORDER[b.rarity] ?? 5));

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">🔍</div><div>没有找到匹配的宝石</div></div>';
    } else {
      filtered.forEach(gem => {
        const el = document.createElement("div");
        el.className = "gem-item";
        // 根据稀有度设置边框颜色
        const borderColor = RARITY_BORDER[gem.rarity] || '#9c27b0';
        el.style.borderColor = borderColor + '44';
        el.style.setProperty('--gem-border', borderColor);

        // Image with fallback
        const img = document.createElement("img");
        img.src = gem.image;
        img.alt = gem.name;
        const placeholder = document.createElement("div");
        placeholder.className = "gem-placeholder";
        placeholder.textContent = "💎";
        placeholder.style.display = "none";
        img.onerror = function() { img.style.display = "none"; placeholder.style.display = "flex"; };
        el.appendChild(placeholder);
        el.appendChild(img);

        // Info
        const info = document.createElement("div");
        info.className = "gem-info";
        const nameEl = document.createElement("div");
        nameEl.className = "gem-name";
        nameEl.textContent = gem.name;
        info.appendChild(nameEl);
        const effectEl = document.createElement("div");
        effectEl.className = "gem-effect";
        effectEl.textContent = gem.effect;
        info.appendChild(effectEl);
        el.appendChild(info);

        // Rarity badge
        const rarityEl = document.createElement("span");
        rarityEl.className = "gem-rarity";
        rarityEl.textContent = RARITY_CN[gem.rarity] || gem.rarity;
        // Color by rarity
        const rarityColors = {
          'Common': '#9e9e9e',
          'Uncommon': '#4caf50',
          'Rare': '#2196f3',
          'Very Rare': '#9c27b0',
          'Ultra Rare': '#ffd700'
        };
        const rc = rarityColors[gem.rarity] || '#888';
        rarityEl.style.cssText = `background:${rc}22;color:${rc};`;
        el.appendChild(rarityEl);

        grid.appendChild(el);
      });
    }

    updateStats(filtered.length);
  }

  // === 弹窗 ===
  function openModal(cardId) {
    const card = getCard(cardId);
    if (!card) return;
    const overlay = document.getElementById("modalOverlay");
    const modal = document.getElementById("modal");

    let html = `
      <button class="modal-close" id="modalClose">&times;</button>
      <div class="modal-card-img-placeholder" style="display:none">🃏</div>
      <img class="modal-card-img" src="${card.image}" alt="${card.name}"
           onerror="this.style.display='none';this.previousElementSibling.style.display='flex';">
      <div class="modal-card-name">${card.name}</div>
      <div class="modal-card-meta">
        ${card.stats && card.stats.mana !== undefined ? `<span class="rarity-badge" style="background:${card.stats.mana === "W" ? "#d4a017" : "#4fc3f7"}22;color:${card.stats.mana === "W" ? "#d4a017" : "#4fc3f7"}">${card.stats.mana === "W" ? "Wild" : card.stats.mana + "费"}</span>` : ""}
        <span class="category-badge">${card.category || ""}</span>
      </div>
      <div class="modal-card-desc">${card.description || "暂无描述"}</div>`;

    if (card.stats) {
      html += '<div class="modal-stats" style="display:flex;gap:12px;justify-content:center;margin-bottom:16px;flex-wrap:wrap;">';
      if (card.stats.attack) html += `<span style="background:#c6282822;color:#c62828;padding:4px 12px;border-radius:6px;font-size:13px;">攻击 ${card.stats.attack}</span>`;
      if (card.stats.range) html += `<span style="background:#4fc3f722;color:#4fc3f7;padding:4px 12px;border-radius:6px;font-size:13px;">范围 ${card.stats.range}</span>`;
      if (card.stats.special) html += `<span style="background:#d4a01722;color:#d4a017;padding:4px 12px;border-radius:6px;font-size:13px;">${card.stats.special}</span>`;
      html += '</div>';
    }

    // 详细描述
    const detail = CARD_DETAILS[cardId];
    if (detail) {
      html += `<div class="modal-section-title">详细说明</div><div class="modal-card-detail">${detail}</div>`;
    }

    const recipes = getRecipesForCard(cardId);
    if (recipes.length > 0) {
      html += '<div class="modal-section-title">合成配方</div>';
      recipes.forEach(recipe => {
        html += '<div class="modal-recipe">';
        const alts = recipe.alternatives || {};
        recipe.materials.forEach(matId => {
          if (alts[matId] && Array.isArray(alts[matId])) {
            html += '<div style="display:flex;align-items:center;gap:2px;">';
            alts[matId].forEach((altId, i) => {
              if (i > 0) html += '<span style="font-size:10px;color:#c62828;">/</span>';
              const alt = getCard(altId);
              if (alt) html += buildMiniCard(altId, alt, 1);
            });
            html += '</div>';
          } else {
            const mat = getCard(matId);
            if (!mat) return;
            html += buildMiniCard(matId, mat, recipe.count[matId] || 1);
          }
        });
        if (alts.passive && recipe.materials.every(m => getCard(m))) {
          html += '<div style="display:flex;align-items:center;gap:2px;">';
          alts.passive.forEach((altId, i) => {
            if (i > 0) html += '<span style="font-size:10px;color:#c62828;">/</span>';
            const alt = getCard(altId);
            if (alt) html += buildMiniCard(altId, alt, 1);
          });
          html += '</div>';
        }
        html += '<div class="mini-arrow">→</div>';
        html += buildMiniCard(recipe.result, card, 1);
        if (recipe.note) html += `<div style="font-size:10px;color:#776655;width:100%;text-align:center;margin-top:4px;">${recipe.note}</div>`;
        html += '</div>';
      });
    }

    const usages = getRecipesUsingCard(cardId);
    if (usages.length > 0) {
      html += '<div class="modal-section-title modal-usages">可用于合成</div>';
      usages.forEach(recipe => {
        const result = getCard(recipe.result);
        if (!result) return;
        html += '<div class="modal-recipe">';
        // 显示完整配方：所有材料 → 成品
        recipe.materials.forEach(matId => {
          const alts = recipe.alternatives?.[matId];
          if (alts === null) {
            html += buildMiniCard(matId, getCard(matId), recipe.count[matId] || 1);
          } else if (Array.isArray(alts)) {
            html += '<div style="display:flex;align-items:center;gap:2px;">';
            const main = getCard(matId);
            if (main) html += buildMiniCard(matId, main, recipe.count[matId] || 1);
            alts.forEach(altId => {
              html += '<span style="font-size:10px;color:#c62828;">/</span>';
              const alt = getCard(altId);
              if (alt) html += buildMiniCard(altId, alt, 1);
            });
            html += '</div>';
          } else {
            html += buildMiniCard(matId, getCard(matId), recipe.count[matId] || 1);
          }
        });
        if (recipe.alternatives?.passive) {
          html += '<div style="display:flex;align-items:center;gap:2px;">';
          recipe.alternatives.passive.forEach((altId, i) => {
            if (i > 0) html += '<span style="font-size:10px;color:#c62828;">/</span>';
            const alt = getCard(altId);
            if (alt) html += buildMiniCard(altId, alt, 1);
          });
          html += '</div>';
        }
        html += '<div class="mini-arrow">→</div>';
        html += buildMiniCard(recipe.result, result, 1);
        html += '</div>';
      });
    }

    if (recipes.length === 0 && usages.length === 0) {
      html += '<div class="modal-no-recipe">该卡牌暂无合成配方</div>';
    }

    modal.innerHTML = html;
    overlay.classList.add("active");
    document.getElementById("modalClose").addEventListener("click", closeModal);
    modal.querySelectorAll(".mini-card[data-card-id]").forEach(el => {
      el.addEventListener("click", () => { const id = el.getAttribute("data-card-id"); if (id) openModal(id); });
    });

    // 将 <ref> 标签转换为可点击的卡牌引用
    modal.querySelectorAll("ref").forEach(refEl => {
      const id = refEl.getAttribute("id");
      const refCard = id && getCard(id);
      if (!refCard) return;
      const a = document.createElement("span");
      a.className = "card-ref";
      a.innerHTML = `<img src="${refCard.image}" alt="${refCard.name}" onerror="this.style.display='none'"><span>${refEl.textContent}</span>`;
      a.addEventListener("click", (e) => { e.stopPropagation(); openModal(id); });
      refEl.replaceWith(a);
    });
  }

  function closeModal() {
    document.getElementById("modalOverlay").classList.remove("active");
  }

  // === 搜索 ===
  // === 全局搜索 ===
  function renderGlobalSearch() {
    hideAllSections();
    const section = document.getElementById("globalSearchSection");
    section.style.display = "block";
    section.innerHTML = "";

    // 搜卡牌
    const matchedCards = CARDS.filter(c => matchSearch(c, currentSearch));
    // 搜合成配方
    const matchedRecipes = RECIPES.filter(r => matchRecipe(r, currentSearch));
    // 搜宝石
    const matchedGems = GEMS.filter(g =>
      g.name.toLowerCase().includes(currentSearch)
      || g.effect.toLowerCase().includes(currentSearch)
      || g.id.includes(currentSearch)
      || (GEM_PINYIN_MAP[g.id] && GEM_PINYIN_MAP[g.id].includes(currentSearch))
    );
    // 搜解锁项
    const matchedUnlocks = UNLOCKS.filter(u =>
      u.name.toLowerCase().includes(currentSearch)
      || (u.nameEn && u.nameEn.toLowerCase().includes(currentSearch))
      || u.description.toLowerCase().includes(currentSearch)
      || (u.unlocks && u.unlocks.toLowerCase().includes(currentSearch))
      || u.id.includes(currentSearch)
      || (UNLOCK_PINYIN_MAP[u.id] && UNLOCK_PINYIN_MAP[u.id].includes(currentSearch))
    );

    const total = matchedCards.length + matchedRecipes.length + matchedGems.length + matchedUnlocks.length;
    updateStats(total);

    if (total === 0) {
      section.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div>没有找到匹配的内容</div></div>';
      return;
    }

    // 卡牌结果
    if (matchedCards.length > 0) {
      const header = document.createElement("div");
      header.className = "section-title";
      header.textContent = "卡牌（" + matchedCards.length + "）";
      section.appendChild(header);
      const grid = document.createElement("div");
      grid.className = "card-grid";
      if (currentViewMode === "list") grid.classList.add("list-view");
      matchedCards.forEach(card => {
        const el = document.createElement("div");
        el.className = "card-item rarity-" + (card.rarity || "common");
        el.addEventListener("click", () => openModal(card.id));
        el.appendChild(createCardImage(card, 80));
        const isListView = currentViewMode === "list";
        const infoEl = isListView ? document.createElement("div") : null;
        if (isListView) { infoEl.className = "card-info"; el.appendChild(infoEl); }
        const parent = isListView ? infoEl : el;
        const nameEl = document.createElement("div");
        nameEl.className = "card-name";
        nameEl.textContent = card.name;
        parent.appendChild(nameEl);
        if (card.stats) {
          const statsEl = document.createElement("div");
          statsEl.style.cssText = "font-size:10px;color:#aa8866;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          const parts = [];
          if (card.stats.mana !== undefined) parts.push(card.stats.mana + "费");
          if (card.stats.attack !== undefined) parts.push("攻" + card.stats.attack);
          if (card.stats.special) parts.push(card.stats.special);
          statsEl.textContent = parts.join(" · ");
          parent.appendChild(statsEl);
        }
        grid.appendChild(el);
      });
      section.appendChild(grid);
    }

    // 合成配方结果
    if (matchedRecipes.length > 0) {
      const header = document.createElement("div");
      header.className = "section-title";
      header.style.marginTop = "24px";
      header.textContent = "合成配方（" + matchedRecipes.length + "）";
      section.appendChild(header);
      const list = document.createElement("div");
      list.className = "recipe-list";
      matchedRecipes.forEach(recipe => list.appendChild(buildRecipeCard(recipe)));
      section.appendChild(list);
    }

    // 宝石结果
    if (matchedGems.length > 0) {
      const header = document.createElement("div");
      header.className = "section-title";
      header.style.marginTop = "24px";
      header.textContent = "宝石（" + matchedGems.length + "）";
      section.appendChild(header);
      const grid = document.createElement("div");
      grid.className = "gem-grid";
      matchedGems.forEach(gem => {
        const el = document.createElement("div");
        el.className = "gem-item";
        const img = document.createElement("img");
        img.src = gem.image;
        img.alt = gem.name;
        const placeholder = document.createElement("div");
        placeholder.className = "gem-placeholder";
        placeholder.textContent = "💎";
        placeholder.style.display = "none";
        img.onerror = function() { img.style.display = "none"; placeholder.style.display = "flex"; };
        el.appendChild(placeholder);
        el.appendChild(img);
        const info = document.createElement("div");
        info.className = "gem-info";
        const nameEl = document.createElement("div");
        nameEl.className = "gem-name";
        nameEl.textContent = gem.name;
        info.appendChild(nameEl);
        const descEl = document.createElement("div");
        descEl.className = "gem-desc";
        descEl.textContent = gem.effect;
        info.appendChild(descEl);
        if (gem.rarity) {
          const rarityEl = document.createElement("span");
          rarityEl.className = "gem-rarity";
          const rarityColors = { 'Common': '#9e9e9e', 'Uncommon': '#4caf50', 'Rare': '#2196f3', 'Very Rare': '#9c27b0', 'Ultra Rare': '#ff9800' };
          rarityEl.style.color = rarityColors[gem.rarity] || '#aa8866';
          rarityEl.textContent = RARITY_CN[gem.rarity] || gem.rarity;
          info.appendChild(rarityEl);
        }
        el.appendChild(info);
        grid.appendChild(el);
      });
      section.appendChild(grid);
    }

    // 解锁项结果
    if (matchedUnlocks.length > 0) {
      const header = document.createElement("div");
      header.className = "section-title";
      header.style.marginTop = "24px";
      header.textContent = "解锁项（" + matchedUnlocks.length + "）";
      section.appendChild(header);
      const grid = document.createElement("div");
      grid.className = "unlock-grid";
      matchedUnlocks.forEach(unlock => {
        const el = document.createElement("div");
        el.className = "unlock-item";
        const img = document.createElement("img");
        img.src = unlock.image;
        img.alt = unlock.name;
        const placeholder = document.createElement("div");
        placeholder.className = "unlock-placeholder";
        placeholder.textContent = "🔓";
        placeholder.style.display = "none";
        img.onerror = function() { img.style.display = "none"; placeholder.style.display = "flex"; };
        el.appendChild(placeholder);
        el.appendChild(img);
        const info = document.createElement("div");
        info.className = "unlock-info";
        const nameEl = document.createElement("div");
        nameEl.className = "unlock-name";
        nameEl.textContent = unlock.name;
        info.appendChild(nameEl);
        if (unlock.nameEn && unlock.nameEn !== unlock.name) {
          const nameEnEl = document.createElement("div");
          nameEnEl.className = "unlock-name-en";
          nameEnEl.textContent = unlock.nameEn;
          info.appendChild(nameEnEl);
        }
        const descEl = document.createElement("div");
        descEl.className = "unlock-desc";
        descEl.textContent = unlock.description;
        info.appendChild(descEl);
        if (unlock.unlocks) {
          const unlocksEl = document.createElement("div");
          unlocksEl.className = "unlock-reward";
          unlocksEl.textContent = unlock.unlocks;
          info.appendChild(unlocksEl);
        }
        el.appendChild(info);
        const catEl = document.createElement("span");
        catEl.className = "unlock-cat";
        catEl.textContent = unlock.category;
        el.appendChild(catEl);
        grid.appendChild(el);
      });
      section.appendChild(grid);
    }
  }

  function initSearch() {
    const input = document.getElementById("searchInput");
    input.addEventListener("input", () => {
      currentSearch = input.value.trim().toLowerCase();
      if (currentSearch) {
        renderGlobalSearch();
      } else {
        // 恢复当前标签
        switchTab(currentTab);
      }
    });
  }

  // === 点击遮罩关闭弹窗 ===
  function initModalOverlay() {
    document.getElementById("modalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "modalOverlay") closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  // === 初始化 ===
  function initGemRarityToggle() {
    const toggle = document.getElementById("gemRarityToggle");
    const content = document.getElementById("gemRarityContent");
    if (toggle && content) {
      toggle.addEventListener("click", () => {
        const open = content.style.display !== "none";
        content.style.display = open ? "none" : "block";
        toggle.classList.toggle("open", !open);
      });
    }
  }

  function init() {
    initTabs();
    initSearch();
    initModalOverlay();
    initGemRarityToggle();
    initViewToggle();
    renderFilterBar();
    renderCardGrid();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
