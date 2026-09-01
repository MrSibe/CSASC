<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import {
  TEAM_MAX_MEMBERS,
  TEAM_MIN_MEMBERS,
  validateRegistrationPayload,
} from "../../../shared/registration.mjs";

interface MemberDraft {
  key: string;
  realName: string;
  email: string;
  qq: string;
  organization: string;
}

interface RegistrationConfig {
  campaignCode: string;
  campaignTitle: string;
  opensAt: string;
  closesAt: string;
  isOpen: boolean;
  status: "open" | "not_started" | "closed" | "configuration_error";
  teamMinMembers: number;
  teamMaxMembers: number;
  turnstileSiteKey: string;
}

interface FieldError {
  path: string;
  message: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

let memberSequence = 0;
const createMember = (): MemberDraft => ({
  key: `member-${++memberSequence}`,
  realName: "",
  email: "",
  qq: "",
  organization: "",
});

const registrationType = ref<"individual" | "team">("individual");
const teamName = ref("");
const members = ref<MemberDraft[]>([createMember()]);
const privacyAccepted = ref(false);
const accuracyConfirmed = ref(false);
const teamAuthorization = ref(false);
const config = ref<RegistrationConfig | null>(null);
const configLoading = ref(true);
const configError = ref("");
const submitError = ref("");
const fieldErrors = ref<Record<string, string>>({});
const submitting = ref(false);
const successNumber = ref("");
const submittedAt = ref("");
const idempotencyKey = ref("");
const turnstileToken = ref("");
const turnstileContainer = ref<HTMLElement | null>(null);
let turnstileWidgetId = "";

const visibleMembers = computed(() =>
  registrationType.value === "individual" ? members.value.slice(0, 1) : members.value,
);
const canAddMember = computed(
  () => registrationType.value === "team" && members.value.length < TEAM_MAX_MEMBERS,
);
const canRemoveMember = computed(() => members.value.length > TEAM_MIN_MEMBERS);

function selectType(type: "individual" | "team") {
  registrationType.value = type;
  fieldErrors.value = {};
  submitError.value = "";
  if (type === "team" && members.value.length < TEAM_MIN_MEMBERS) {
    members.value.push(createMember());
  }
}

async function addMember() {
  if (!canAddMember.value) return;
  const member = createMember();
  members.value.push(member);
  await nextTick();
  document.querySelector<HTMLInputElement>(`#${member.key}-realName`)?.focus();
}

function removeMember(index: number) {
  if (index === 0 || !canRemoveMember.value) return;
  members.value.splice(index, 1);
  fieldErrors.value = {};
}

function statusText(status: RegistrationConfig["status"]): string {
  if (status === "not_started") return "报名尚未开始";
  if (status === "closed") return "本期报名已经截止";
  if (status === "configuration_error") return "报名服务正在配置";
  return "报名开放中";
}

function formatBeijingTime(value: string): string {
  if (!value) return "待公布";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function createIdempotencyKey() {
  const randomPart = crypto.getRandomValues(new Uint32Array(4)).join("");
  idempotencyKey.value = `${crypto.randomUUID()}-${randomPart}`;
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("#csasc-turnstile-script");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Turnstile load failed")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "csasc-turnstile-script";
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile load failed"));
    document.head.appendChild(script);
  });
}

async function renderTurnstile() {
  if (!config.value?.turnstileSiteKey || !turnstileContainer.value || turnstileWidgetId) return;
  try {
    await loadTurnstileScript();
    if (!window.turnstile || !turnstileContainer.value) throw new Error("Turnstile unavailable");
    turnstileWidgetId = window.turnstile.render(turnstileContainer.value, {
      sitekey: config.value.turnstileSiteKey,
      theme: "auto",
      language: "zh-cn",
      callback: (token: string) => {
        turnstileToken.value = token;
        delete fieldErrors.value.turnstileToken;
      },
      "expired-callback": () => {
        turnstileToken.value = "";
      },
      "error-callback": () => {
        turnstileToken.value = "";
        submitError.value = "人机验证加载失败，请检查网络后重试。";
      },
    });
  } catch {
    submitError.value = "人机验证暂时无法加载，请刷新页面后重试。";
  }
}

function resetTurnstile() {
  turnstileToken.value = "";
  if (turnstileWidgetId && window.turnstile) window.turnstile.reset(turnstileWidgetId);
}

async function loadConfig() {
  configLoading.value = true;
  configError.value = "";
  try {
    const response = await fetch("/api/registration-config", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("config request failed");
    config.value = (await response.json()) as RegistrationConfig;
    await nextTick();
    if (config.value.isOpen) await renderTurnstile();
  } catch {
    configError.value = "暂时无法读取报名状态，请稍后刷新页面。";
  } finally {
    configLoading.value = false;
  }
}

function mapErrors(errors: FieldError[]) {
  fieldErrors.value = Object.fromEntries(errors.map((error) => [error.path, error.message]));
  const firstPath = errors[0]?.path;
  if (!firstPath) return;
  const inputId = firstPath.replace(/members\.(\d+)\.(.+)/, (_, index, field) => {
    const member = visibleMembers.value[Number(index)];
    return member ? `${member.key}-${field}` : "";
  });
  nextTick(() => document.getElementById(inputId)?.focus());
}

async function submitRegistration() {
  submitError.value = "";
  fieldErrors.value = {};

  const payload = {
    registrationType: registrationType.value,
    teamName: teamName.value,
    members: visibleMembers.value.map(({ realName, email, qq, organization }) => ({
      realName,
      email,
      qq,
      organization,
    })),
    privacyAccepted: privacyAccepted.value,
    accuracyConfirmed: accuracyConfirmed.value,
    teamAuthorization: teamAuthorization.value,
    turnstileToken: turnstileToken.value,
  };
  const validation = validateRegistrationPayload(payload);
  if (!validation.ok) {
    mapErrors(validation.errors);
    return;
  }
  if (!turnstileToken.value) {
    fieldErrors.value = { turnstileToken: "请先完成人机验证" };
    return;
  }

  submitting.value = true;
  try {
    const response = await fetch("/api/registrations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": idempotencyKey.value,
      },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as {
      error?: string;
      fields?: FieldError[];
      registrationNumber?: string;
      submittedAt?: string;
    };
    if (!response.ok) {
      if (result.fields?.length) mapErrors(result.fields);
      submitError.value = result.error || "提交失败，请稍后重试。";
      resetTurnstile();
      return;
    }
    successNumber.value = result.registrationNumber || "";
    submittedAt.value = result.submittedAt || new Date().toISOString();
    const formTop = document.querySelector(".registration-shell")?.getBoundingClientRect().top ?? 0;
    window.scrollTo({ top: window.scrollY + formTop - 80, behavior: "smooth" });
  } catch {
    submitError.value = "网络连接中断。请保持本页内容，稍后再次提交；系统不会重复创建报名。";
    resetTurnstile();
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  createIdempotencyKey();
  void loadConfig();
});

onBeforeUnmount(() => {
  if (turnstileWidgetId && window.turnstile) window.turnstile.remove(turnstileWidgetId);
});
</script>

<template>
  <section class="registration-shell" aria-labelledby="registration-form-title">
    <div class="orbit-mark" aria-hidden="true"><span></span></div>

    <div v-if="successNumber" class="success-panel" role="status">
      <p class="eyebrow">TRANSMISSION RECEIVED · 报名已接收</p>
      <h2 id="registration-form-title">你的报名编号</h2>
      <output class="registration-number">{{ successNumber }}</output>
      <p>请截图或抄录此编号。它仅用于联系管理员时核对报名，不能用于在线查询资料。</p>
      <dl>
        <div>
          <dt>活动届次</dt>
          <dd>{{ config?.campaignTitle }}</dd>
        </div>
        <div>
          <dt>提交时间</dt>
          <dd>{{ formatBeijingTime(submittedAt) }}</dd>
        </div>
      </dl>
    </div>

    <template v-else>
      <header class="form-header">
        <div>
          <p class="eyebrow">APPLICATION LOG · 报名日志</p>
          <h2 id="registration-form-title">填写报名信息</h2>
          <p class="header-copy">请由本人或队长一次填写完整。带 <span aria-hidden="true">＊</span> 的项目为必填项。</p>
        </div>
        <div class="status-chip" :class="{ open: config?.isOpen }" aria-live="polite">
          <span></span>{{ configLoading ? "正在读取状态" : config ? statusText(config.status) : "状态未知" }}
        </div>
      </header>

      <div v-if="configError" class="notice error" role="alert">
        {{ configError }}
        <button type="button" @click="loadConfig">重新读取</button>
      </div>

      <div v-else-if="config && !config.isOpen" class="closed-panel">
        <strong>{{ statusText(config.status) }}</strong>
        <p v-if="config.status === 'not_started'">开放时间：{{ formatBeijingTime(config.opensAt) }}</p>
        <p v-else-if="config.status === 'closed'">截止时间：{{ formatBeijingTime(config.closesAt) }}</p>
        <p v-else>管理员完成活动届次和开放时间配置后即可接受报名。</p>
      </div>

      <form v-else class="registration-form" novalidate @submit.prevent="submitRegistration">
        <fieldset class="type-selector">
          <legend>01 / 选择报名方式</legend>
          <div class="type-grid">
            <button type="button" :class="{ selected: registrationType === 'individual' }"
              :aria-pressed="registrationType === 'individual'" @click="selectType('individual')">
              <span class="type-index">A</span>
              <strong>个人报名</strong>
              <small>由活动志愿者协助组队</small>
            </button>
            <button type="button" :class="{ selected: registrationType === 'team' }"
              :aria-pressed="registrationType === 'team'" @click="selectType('team')">
              <span class="type-index">B</span>
              <strong>团队报名</strong>
              <small>含队长共 2–9 人</small>
            </button>
          </div>
        </fieldset>

        <section v-if="registrationType === 'team'" class="team-name-section">
          <label for="team-name">队名 <span>＊</span></label>
          <input id="team-name" v-model="teamName" type="text" maxlength="80" autocomplete="organization"
            :aria-invalid="Boolean(fieldErrors.teamName)"
            :aria-describedby="fieldErrors.teamName ? 'team-name-error' : undefined" placeholder="例如：猎户座巡天队" />
          <p v-if="fieldErrors.teamName" id="team-name-error" class="field-error">{{ fieldErrors.teamName }}</p>
        </section>

        <fieldset class="members-section">
          <legend>02 / {{ registrationType === "team" ? "填写团队成员" : "填写个人信息" }}</legend>
          <div class="member-count">
            <span>{{ visibleMembers.length.toString().padStart(2, "0") }}</span>
            {{ registrationType === "team" ? `/ ${TEAM_MAX_MEMBERS} 人` : "名报名者" }}
          </div>

          <TransitionGroup name="member-list" tag="div" class="member-list">
            <article v-for="(member, index) in visibleMembers" :key="member.key" class="member-card">
              <header>
                <div>
                  <span class="member-order">{{ (index + 1).toString().padStart(2, "0") }}</span>
                  <h3>{{ index === 0 && registrationType === "team" ? "队长" : registrationType === "team" ? `队员 ${index}`
                    : "报名者" }}</h3>
                </div>
                <button v-if="registrationType === 'team' && index > 0" type="button" class="remove-member"
                  :disabled="!canRemoveMember" :aria-label="`移除队员 ${index}`" @click="removeMember(index)">移除</button>
              </header>

              <div class="field-grid">
                <div class="field">
                  <label :for="`${member.key}-realName`">真实姓名 <span>＊</span></label>
                  <input :id="`${member.key}-realName`" v-model="member.realName" type="text" maxlength="50"
                    autocomplete="name" :aria-invalid="Boolean(fieldErrors[`members.${index}.realName`])" />
                  <p v-if="fieldErrors[`members.${index}.realName`]" class="field-error">{{
                    fieldErrors[`members.${index}.realName`] }}</p>
                </div>
                <div class="field">
                  <label :for="`${member.key}-email`">邮箱 <span>＊</span></label>
                  <input :id="`${member.key}-email`" v-model="member.email" type="email" maxlength="254"
                    autocomplete="email" inputmode="email"
                    :aria-invalid="Boolean(fieldErrors[`members.${index}.email`])" />
                  <p v-if="fieldErrors[`members.${index}.email`]" class="field-error">{{
                    fieldErrors[`members.${index}.email`] }}</p>
                </div>
                <div class="field">
                  <label :for="`${member.key}-qq`">QQ 号 <span>＊</span></label>
                  <input :id="`${member.key}-qq`" v-model="member.qq" type="text" maxlength="12" inputmode="numeric"
                    pattern="[1-9][0-9]{4,11}" :aria-invalid="Boolean(fieldErrors[`members.${index}.qq`])" />
                  <p v-if="fieldErrors[`members.${index}.qq`]" class="field-error">{{ fieldErrors[`members.${index}.qq`]
                    }}</p>
                </div>
                <div class="field">
                  <label :for="`${member.key}-organization`">学校或组织 <small>选填</small></label>
                  <input :id="`${member.key}-organization`" v-model="member.organization" type="text" maxlength="120"
                    autocomplete="organization" :aria-invalid="Boolean(fieldErrors[`members.${index}.organization`])" />
                  <p v-if="fieldErrors[`members.${index}.organization`]" class="field-error">{{
                    fieldErrors[`members.${index}.organization`] }}</p>
                </div>
              </div>
            </article>
          </TransitionGroup>

          <button v-if="registrationType === 'team'" type="button" class="add-member" :disabled="!canAddMember"
            @click="addMember">
            <span aria-hidden="true">＋</span>
            {{ canAddMember ? "新增队员" : "已达到 9 人上限" }}
          </button>
          <p v-if="fieldErrors.members" class="field-error section-error">{{ fieldErrors.members }}</p>
        </fieldset>

        <fieldset class="confirmation-section">
          <legend>03 / 确认与提交</legend>
          <label v-if="registrationType === 'team'" class="check-row">
            <input v-model="teamAuthorization" type="checkbox" />
            <span>我确认已获得全部队员授权，可以代为提交以上资料。</span>
          </label>
          <p v-if="fieldErrors.teamAuthorization" class="field-error">{{ fieldErrors.teamAuthorization }}</p>
          <label class="check-row">
            <input v-model="privacyAccepted" type="checkbox" />
            <span>我已阅读本页隐私告知，并同意将资料用于本期活动报名、组队和联络。</span>
          </label>
          <p v-if="fieldErrors.privacyAccepted" class="field-error">{{ fieldErrors.privacyAccepted }}</p>
          <label class="check-row">
            <input v-model="accuracyConfirmed" type="checkbox" />
            <span>我确认填写的信息真实准确，并理解提交后需联系管理员才能修改。</span>
          </label>
          <p v-if="fieldErrors.accuracyConfirmed" class="field-error">{{ fieldErrors.accuracyConfirmed }}</p>

          <div ref="turnstileContainer" class="turnstile-box"></div>
          <p v-if="fieldErrors.turnstileToken" class="field-error">{{ fieldErrors.turnstileToken }}</p>

          <div v-if="submitError" class="notice error" role="alert">{{ submitError }}</div>

          <button type="submit" class="submit-button" :disabled="submitting">
            <span>{{ submitting ? "正在发送报名…" : "确认并提交报名" }}</span>
            <span aria-hidden="true">↗</span>
          </button>
          <p class="submit-note">请勿重复点击。网络中断后可以直接重试，系统不会生成重复报名。</p>
        </fieldset>
      </form>
    </template>
  </section>
</template>

<style scoped>
.registration-shell {
  --form-accent: #f5c45d;
  --form-blue: #74a9ff;
  position: relative;
  overflow: hidden;
  margin: 2rem 0 3rem;
  border: 1px solid color-mix(in srgb, var(--form-blue) 28%, transparent);
  border-radius: 1.5rem;
  background:
    linear-gradient(135deg, rgb(116 169 255 / 8%), transparent 38%),
    color-mix(in srgb, var(--vp-c-bg-elv) 92%, #081126);
  box-shadow: 0 30px 80px rgb(3 10 28 / 18%);
}

.registration-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.18;
  background-image: radial-gradient(circle, var(--form-blue) 0.8px, transparent 0.8px);
  background-size: 26px 26px;
  mask-image: linear-gradient(to bottom, #000, transparent 45%);
}

.orbit-mark {
  position: absolute;
  top: -6rem;
  right: -5rem;
  width: 16rem;
  height: 16rem;
  border: 1px solid rgb(245 196 93 / 24%);
  border-radius: 50%;
  pointer-events: none;
}

.orbit-mark::before,
.orbit-mark::after {
  content: "";
  position: absolute;
  inset: 2.7rem;
  border: 1px solid rgb(116 169 255 / 18%);
  border-radius: inherit;
}

.orbit-mark::after {
  inset: 5.4rem;
}

.orbit-mark span {
  position: absolute;
  left: 2.7rem;
  top: 2.2rem;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--form-accent);
  box-shadow: 0 0 18px var(--form-accent);
}

.form-header,
.success-panel,
.closed-panel,
.registration-form {
  position: relative;
  z-index: 1;
}

.form-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 2rem;
  padding: 2rem 2rem 1.6rem;
  border-bottom: 1px solid color-mix(in srgb, var(--vp-c-border) 70%, transparent);
}

.eyebrow {
  margin: 0 0 0.45rem;
  color: var(--form-blue);
  font: 700 0.7rem/1.4 var(--vp-font-mono);
  letter-spacing: 0.18em;
}

.form-header h2,
.success-panel h2 {
  margin: 0;
  font-size: clamp(1.65rem, 4vw, 2.35rem);
}

.header-copy {
  max-width: 35rem;
  margin: 0.55rem 0 0;
  color: color-mix(in srgb, var(--vp-c-text) 72%, transparent);
}

.header-copy span,
label>span {
  color: var(--form-accent);
}

.status-chip {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.45rem;
  margin-top: 0.2rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 999px;
  padding: 0.4rem 0.7rem;
  color: color-mix(in srgb, var(--vp-c-text) 65%, transparent);
  font: 700 0.72rem/1 var(--vp-font-mono);
}

.status-chip span {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: #a7afc0;
}

.status-chip.open {
  border-color: rgb(67 194 142 / 35%);
  color: #2fb98b;
}

.status-chip.open span {
  background: #43c28e;
  box-shadow: 0 0 10px #43c28e;
}

.registration-form {
  padding: 0 2rem 2rem;
}

fieldset {
  min-width: 0;
  margin: 0;
  border: 0;
  padding: 2rem 0 0;
}

legend {
  width: 100%;
  margin-bottom: 1rem;
  color: var(--form-accent);
  font: 700 0.78rem/1.4 var(--vp-font-mono);
  letter-spacing: 0.12em;
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
}

.type-grid button {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.9rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 1rem;
  padding: 1.1rem;
  background: color-mix(in srgb, var(--vp-c-bg) 70%, transparent);
  color: var(--vp-c-text);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease, background 0.2s ease;
}

.type-grid button:hover {
  transform: translateY(-2px);
  border-color: var(--form-blue);
}

.type-grid button.selected {
  border-color: var(--form-accent);
  background: color-mix(in srgb, var(--form-accent) 9%, var(--vp-c-bg));
  box-shadow: inset 3px 0 var(--form-accent);
}

.type-index {
  grid-row: span 2;
  color: var(--form-accent);
  font: 700 1.4rem/1 var(--vp-font-heading);
}

.type-grid strong {
  font-size: 1rem;
}

.type-grid small {
  color: color-mix(in srgb, var(--vp-c-text) 62%, transparent);
}

.team-name-section {
  padding-top: 1.5rem;
}

.team-name-section label,
.field label {
  display: block;
  margin-bottom: 0.42rem;
  font-size: 0.84rem;
  font-weight: 700;
}

.field label small {
  margin-left: 0.35rem;
  color: color-mix(in srgb, var(--vp-c-text) 50%, transparent);
  font-weight: 500;
}

input[type="text"],
input[type="email"] {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--vp-c-border);
  border-radius: 0.72rem;
  padding: 0.76rem 0.85rem;
  background: color-mix(in srgb, var(--vp-c-bg) 82%, transparent);
  color: var(--vp-c-text);
  font: inherit;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

input:focus {
  border-color: var(--form-blue);
  box-shadow: 0 0 0 3px rgb(116 169 255 / 14%);
}

input[aria-invalid="true"] {
  border-color: #e26d76;
}

.members-section {
  position: relative;
}

.member-count {
  position: absolute;
  top: 1.8rem;
  right: 0;
  color: color-mix(in srgb, var(--vp-c-text) 56%, transparent);
  font: 600 0.73rem/1 var(--vp-font-mono);
}

.member-count span {
  color: var(--form-blue);
  font-size: 1.15rem;
}

.member-list {
  display: grid;
  gap: 1rem;
}

.member-card {
  border: 1px solid color-mix(in srgb, var(--vp-c-border) 80%, transparent);
  border-radius: 1rem;
  padding: 1.1rem;
  background: color-mix(in srgb, var(--vp-c-bg) 62%, transparent);
}

.member-card>header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.member-card>header>div {
  display: flex;
  align-items: baseline;
  gap: 0.65rem;
}

.member-card h3 {
  margin: 0;
  font-size: 1rem;
}

.member-order {
  color: var(--form-blue);
  font: 700 0.72rem/1 var(--vp-font-mono);
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.remove-member {
  border: 0;
  background: transparent;
  color: #d96772;
  font-weight: 700;
  cursor: pointer;
}

.remove-member:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.add-member {
  width: 100%;
  margin-top: 1rem;
  border: 1px dashed color-mix(in srgb, var(--form-blue) 60%, var(--vp-c-border));
  border-radius: 0.9rem;
  padding: 0.8rem;
  background: transparent;
  color: var(--form-blue);
  font-weight: 700;
  cursor: pointer;
}

.add-member:hover:not(:disabled) {
  background: rgb(116 169 255 / 8%);
}

.add-member:disabled {
  color: color-mix(in srgb, var(--vp-c-text) 40%, transparent);
  cursor: not-allowed;
}

.add-member span {
  margin-right: 0.35rem;
  font-size: 1.1rem;
}

.confirmation-section {
  border-top: 1px solid var(--vp-c-border);
  margin-top: 2rem;
}

.check-row {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  margin: 0.8rem 0;
  color: color-mix(in srgb, var(--vp-c-text) 82%, transparent);
  font-size: 0.88rem;
  cursor: pointer;
}

.check-row input {
  flex: 0 0 auto;
  width: 1.05rem;
  height: 1.05rem;
  margin-top: 0.15rem;
  accent-color: #3d7eff;
}

.turnstile-box {
  min-height: 65px;
  margin: 1.3rem 0 0.5rem;
}

.submit-button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  margin-top: 1rem;
  border: 0;
  border-radius: 0.9rem;
  padding: 0.95rem 1.1rem;
  background: linear-gradient(105deg, #efbd55, #ffd985);
  color: #211700;
  box-shadow: 0 12px 28px rgb(245 196 93 / 22%);
  font: 800 0.95rem/1 var(--vp-font);
  cursor: pointer;
}

.submit-button:hover:not(:disabled) {
  filter: brightness(1.04);
  transform: translateY(-1px);
}

.submit-button:disabled {
  filter: grayscale(0.6);
  opacity: 0.65;
  cursor: wait;
}

.submit-note {
  margin: 0.65rem 0 0;
  color: color-mix(in srgb, var(--vp-c-text) 50%, transparent);
  font-size: 0.76rem;
  text-align: center;
}

.notice {
  position: relative;
  margin: 1rem 2rem 0;
  border-radius: 0.75rem;
  padding: 0.8rem 0.95rem;
}

.registration-form .notice {
  margin-inline: 0;
}

.notice.error {
  border: 1px solid rgb(226 109 118 / 35%);
  background: rgb(226 109 118 / 9%);
  color: #d85d68;
}

.notice button {
  margin-left: 0.5rem;
  border: 0;
  background: transparent;
  color: inherit;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
}

.field-error {
  margin: 0.35rem 0 0;
  color: #d85d68;
  font-size: 0.76rem;
}

.section-error {
  text-align: center;
}

.closed-panel,
.success-panel {
  margin: 2rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 1rem;
  padding: 2rem;
  background: color-mix(in srgb, var(--vp-c-bg) 72%, transparent);
}

.closed-panel strong {
  font-family: var(--vp-font-heading);
  font-size: 1.4rem;
}

.closed-panel p {
  margin-bottom: 0;
  color: color-mix(in srgb, var(--vp-c-text) 65%, transparent);
}

.success-panel {
  text-align: center;
}

.registration-number {
  display: block;
  margin: 1.2rem auto;
  color: var(--form-accent);
  font: 700 clamp(1.2rem, 4vw, 1.8rem)/1.2 var(--vp-font-mono);
  letter-spacing: 0.06em;
}

.success-panel>p:not(.eyebrow) {
  max-width: 34rem;
  margin-inline: auto;
  color: color-mix(in srgb, var(--vp-c-text) 68%, transparent);
}

.success-panel dl {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  max-width: 32rem;
  margin: 1.5rem auto 0;
  border-top: 1px solid var(--vp-c-border);
  padding-top: 1rem;
}

.success-panel dt {
  color: color-mix(in srgb, var(--vp-c-text) 50%, transparent);
  font-size: 0.75rem;
}

.success-panel dd {
  margin: 0.25rem 0 0;
  font-weight: 700;
}

.member-list-enter-active,
.member-list-leave-active {
  transition: all 0.24s ease;
}

.member-list-enter-from,
.member-list-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@media (max-width: 719px) {
  .form-header {
    display: block;
    padding: 1.4rem 1.1rem 1.2rem;
  }

  .status-chip {
    margin-top: 1rem;
  }

  .registration-form {
    padding: 0 1.1rem 1.2rem;
  }

  .type-grid,
  .field-grid {
    grid-template-columns: 1fr;
  }

  .closed-panel,
  .success-panel {
    margin: 1.1rem;
    padding: 1.3rem;
  }

  .notice {
    margin-inline: 1.1rem;
  }

  .success-panel dl {
    grid-template-columns: 1fr;
    gap: 0.8rem;
  }
}

@media (prefers-reduced-motion: reduce) {

  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition: none !important;
  }
}
</style>
