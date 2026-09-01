<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

interface RegistrationSummary {
  id: string;
  registration_no: string;
  campaign_code: string;
  registration_type: "individual" | "team";
  team_name: string | null;
  created_at: string;
  member_count: number;
  captain_name: string;
  captain_email: string;
  captain_qq: string;
}

interface RegistrationMember {
  id: string;
  position: number;
  is_captain: number;
  real_name: string;
  email: string;
  qq: string;
  organization: string | null;
}

interface RegistrationDetail extends RegistrationSummary {
  members: RegistrationMember[];
}

const items = ref<RegistrationSummary[]>([]);
const total = ref(0);
const page = ref(1);
const pageCount = ref(1);
const pageSize = 20;
const campaign = ref("");
const type = ref("");
const query = ref("");
const activeFilters = ref({ campaign: "", type: "", query: "" });
const administrator = ref("");
const loading = ref(true);
const error = ref("");
const detail = ref<RegistrationDetail | null>(null);
const detailLoading = ref(false);
const deleteConfirmation = ref("");
const deleteBusy = ref(false);
const deleteError = ref("");

const rangeText = computed(() => {
  if (!total.value) return "0 条记录";
  const start = (page.value - 1) * pageSize + 1;
  const end = Math.min(total.value, page.value * pageSize);
  return `${start}–${end} / 共 ${total.value} 条`;
});

const exportUrl = computed(() => {
  const params = buildParams(false);
  return `/api/registrations.csv${params.toString() ? `?${params}` : ""}`;
});

function buildParams(includePage = true): URLSearchParams {
  const params = new URLSearchParams();
  const filters = activeFilters.value;
  if (includePage) {
    params.set("page", String(page.value));
    params.set("pageSize", String(pageSize));
  }
  if (filters.campaign) params.set("campaign", filters.campaign);
  if (filters.type) params.set("type", filters.type);
  if (filters.query) params.set("q", filters.query);
  return params;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

async function loadRegistrations() {
  loading.value = true;
  error.value = "";
  try {
    const response = await fetch(`/api/registrations?${buildParams()}`, { headers: { Accept: "application/json" } });
    const result = await response.json() as {
      items?: RegistrationSummary[];
      total?: number;
      pageCount?: number;
      administrator?: string;
      error?: string;
    };
    if (!response.ok) throw new Error(result.error || "读取报名记录失败");
    items.value = result.items ?? [];
    total.value = result.total ?? 0;
    pageCount.value = result.pageCount ?? 1;
    administrator.value = result.administrator ?? administrator.value;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "读取报名记录失败";
  } finally {
    loading.value = false;
  }
}

function applyFilters() {
  activeFilters.value = {
    campaign: campaign.value.trim(),
    type: type.value,
    query: query.value.trim(),
  };
  page.value = 1;
  void loadRegistrations();
}

function clearFilters() {
  campaign.value = "";
  type.value = "";
  query.value = "";
  applyFilters();
}

function changePage(nextPage: number) {
  if (nextPage < 1 || nextPage > pageCount.value || nextPage === page.value) return;
  page.value = nextPage;
  void loadRegistrations();
}

async function openDetail(item: RegistrationSummary) {
  detailLoading.value = true;
  deleteConfirmation.value = "";
  deleteError.value = "";
  try {
    const response = await fetch(`/api/registrations/${encodeURIComponent(item.id)}`, { headers: { Accept: "application/json" } });
    const result = await response.json() as RegistrationDetail & { error?: string };
    if (!response.ok) throw new Error(result.error || "读取报名详情失败");
    detail.value = result;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "读取报名详情失败";
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail() {
  if (deleteBusy.value) return;
  detail.value = null;
  deleteConfirmation.value = "";
  deleteError.value = "";
}

async function deleteRegistration() {
  if (!detail.value || deleteConfirmation.value !== detail.value.registration_no) return;
  deleteBusy.value = true;
  deleteError.value = "";
  try {
    const response = await fetch(`/api/registrations/${encodeURIComponent(detail.value.id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ confirmation: deleteConfirmation.value }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error || "删除失败");
    closeDetail();
    await loadRegistrations();
  } catch (cause) {
    deleteError.value = cause instanceof Error ? cause.message : "删除失败";
  } finally {
    deleteBusy.value = false;
  }
}

onMounted(() => void loadRegistrations());
</script>

<template>
  <div class="admin-shell">
    <aside class="rail" aria-label="系统信息">
      <div class="brand-mark" aria-hidden="true">C</div>
      <div class="rail-line"></div>
      <span>CSASC</span>
      <span>REGISTRY</span>
      <small>15° N / 114° E</small>
    </aside>

    <main>
      <header class="topbar">
        <div>
          <p class="kicker">OBSERVATION REGISTRY · INTERNAL</p>
          <h1>报名台账</h1>
          <p>中国观天者小行星搜寻项目</p>
        </div>
        <div class="operator">
          <span class="signal"></span>
          <div><small>当前管理员</small><strong>{{ administrator || "正在验证…" }}</strong></div>
        </div>
      </header>

      <section class="filter-panel" aria-labelledby="filter-title">
        <div class="section-label"><span>01</span><h2 id="filter-title">筛选观测记录</h2></div>
        <form class="filters" @submit.prevent="applyFilters">
          <label>
            <span>届次</span>
            <input v-model="campaign" type="text" maxlength="40" placeholder="全部届次" />
          </label>
          <label>
            <span>报名类型</span>
            <select v-model="type">
              <option value="">全部类型</option>
              <option value="individual">个人报名</option>
              <option value="team">团队报名</option>
            </select>
          </label>
          <label class="search-field">
            <span>搜索</span>
            <input v-model="query" type="search" maxlength="120" placeholder="编号、队名、姓名、邮箱或 QQ" />
          </label>
          <button type="submit" class="primary">应用筛选</button>
          <button type="button" class="quiet" @click="clearFilters">清除</button>
        </form>
      </section>

      <section class="registry" aria-labelledby="registry-title">
        <div class="registry-head">
          <div class="section-label"><span>02</span><h2 id="registry-title">报名记录</h2></div>
          <div class="actions">
            <button type="button" class="quiet" :disabled="loading" @click="loadRegistrations">刷新</button>
            <a class="export" :href="exportUrl">导出 CSV ↗</a>
          </div>
        </div>

        <div v-if="error" class="alert" role="alert">
          <span>{{ error }}</span>
          <button type="button" @click="loadRegistrations">重试</button>
        </div>

        <div class="table-wrap" :aria-busy="loading">
          <table>
            <thead>
              <tr>
                <th>报名编号</th>
                <th>届次 / 类型</th>
                <th>队伍或报名者</th>
                <th>人数</th>
                <th>提交时间</th>
                <th><span class="sr-only">操作</span></th>
              </tr>
            </thead>
            <tbody v-if="!loading && items.length">
              <tr v-for="item in items" :key="item.id">
                <td><code>{{ item.registration_no }}</code></td>
                <td><span class="campaign">第 {{ item.campaign_code }} 期</span><small>{{ item.registration_type === "team" ? "团队" : "个人" }}</small></td>
                <td><strong>{{ item.team_name || item.captain_name }}</strong><small>{{ item.captain_email }}</small></td>
                <td><span class="member-total">{{ item.member_count }}</span></td>
                <td><time :datetime="item.created_at">{{ formatTime(item.created_at) }}</time></td>
                <td><button type="button" class="detail-link" @click="openDetail(item)">查看</button></td>
              </tr>
            </tbody>
          </table>
          <div v-if="loading" class="empty-state"><span class="spinner"></span>正在读取台账…</div>
          <div v-else-if="!items.length && !error" class="empty-state">没有符合条件的报名记录</div>
        </div>

        <footer class="pagination">
          <span>{{ rangeText }}</span>
          <div>
            <button type="button" :disabled="page <= 1 || loading" @click="changePage(page - 1)">上一页</button>
            <code>{{ page.toString().padStart(2, "0") }} / {{ pageCount.toString().padStart(2, "0") }}</code>
            <button type="button" :disabled="page >= pageCount || loading" @click="changePage(page + 1)">下一页</button>
          </div>
        </footer>
      </section>
    </main>

    <div v-if="detail || detailLoading" class="drawer-backdrop" @click.self="closeDetail">
      <aside class="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div v-if="detailLoading" class="drawer-loading"><span class="spinner"></span>正在校准记录…</div>
        <template v-else-if="detail">
          <header>
            <div><p class="kicker">REGISTRATION DETAIL</p><h2 id="detail-title">{{ detail.team_name || detail.captain_name }}</h2></div>
            <button type="button" aria-label="关闭详情" @click="closeDetail">×</button>
          </header>

          <dl class="metadata">
            <div><dt>报名编号</dt><dd><code>{{ detail.registration_no }}</code></dd></div>
            <div><dt>届次</dt><dd>第 {{ detail.campaign_code }} 期</dd></div>
            <div><dt>类型</dt><dd>{{ detail.registration_type === "team" ? "团队报名" : "个人报名" }}</dd></div>
            <div><dt>提交时间</dt><dd>{{ formatTime(detail.created_at) }}</dd></div>
          </dl>

          <section class="member-detail">
            <div class="section-label"><span>MEM</span><h3>成员资料</h3></div>
            <article v-for="member in detail.members" :key="member.id">
              <header><strong>{{ member.real_name }}</strong><span>{{ member.is_captain ? "队长" : `队员 ${member.position - 1}` }}</span></header>
              <dl>
                <div><dt>邮箱</dt><dd>{{ member.email }}</dd></div>
                <div><dt>QQ</dt><dd>{{ member.qq }}</dd></div>
                <div><dt>学校或组织</dt><dd>{{ member.organization || "—" }}</dd></div>
              </dl>
            </article>
          </section>

          <section class="danger-zone">
            <h3>删除报名</h3>
            <p>仅在响应隐私删除请求或确认记录无效时使用。此操作无法撤销。</p>
            <label>
              输入报名编号 <code>{{ detail.registration_no }}</code> 以确认
              <input v-model="deleteConfirmation" type="text" autocomplete="off" />
            </label>
            <p v-if="deleteError" class="delete-error" role="alert">{{ deleteError }}</p>
            <button
              type="button"
              :disabled="deleteConfirmation !== detail.registration_no || deleteBusy"
              @click="deleteRegistration"
            >{{ deleteBusy ? "正在删除…" : "永久删除这条报名" }}</button>
          </section>
        </template>
      </aside>
    </div>
  </div>
</template>
