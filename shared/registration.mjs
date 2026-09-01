export const TEAM_MIN_MEMBERS = 2;
export const TEAM_MAX_MEMBERS = 9;

export const FIELD_LIMITS = Object.freeze({
  name: 50,
  email: 254,
  qq: 12,
  organization: 120,
  teamName: 80,
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const QQ_PATTERN = /^[1-9]\d{4,11}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

function cleanText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}
export function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function validateText(errors, path, value, label, maxLength, required = true) {
  if (required && !value) {
    errors.push({ path, code: "required", message: `请填写${label}` });
    return;
  }

  if (value.length > maxLength) {
    errors.push({ path, code: "too_long", message: `${label}不能超过 ${maxLength} 个字符` });
  }

  if (CONTROL_CHARACTER_PATTERN.test(value)) {
    errors.push({ path, code: "invalid", message: `${label}包含无效字符` });
  }
}

export function validateRegistrationPayload(raw) {
  const errors = [];
  const registrationType = raw?.registrationType === "team" ? "team" : raw?.registrationType === "individual" ? "individual" : "";
  const rawMembers = Array.isArray(raw?.members) ? raw.members : [];
  const teamName = cleanText(raw?.teamName);

  if (!registrationType) {
    errors.push({ path: "registrationType", code: "invalid", message: "请选择报名方式" });
  }

  if (registrationType === "individual" && rawMembers.length !== 1) {
    errors.push({ path: "members", code: "invalid_count", message: "个人报名只能填写一名成员" });
  }

  if (
    registrationType === "team" &&
    (rawMembers.length < TEAM_MIN_MEMBERS || rawMembers.length > TEAM_MAX_MEMBERS)
  ) {
    errors.push({
      path: "members",
      code: "invalid_count",
      message: `团队报名人数应为 ${TEAM_MIN_MEMBERS}–${TEAM_MAX_MEMBERS} 人（含队长）`,
    });
  }

  if (registrationType === "team") {
    validateText(errors, "teamName", teamName, "队名", FIELD_LIMITS.teamName);
  }

  const members = rawMembers.map((rawMember, index) => {
    const realName = cleanText(rawMember?.realName);
    const email = normalizeEmail(rawMember?.email);
    const qq = cleanText(rawMember?.qq);
    const organization = cleanText(rawMember?.organization);
    const prefix = `members.${index}`;

    validateText(errors, `${prefix}.realName`, realName, "真实姓名", FIELD_LIMITS.name);
    validateText(errors, `${prefix}.email`, email, "邮箱", FIELD_LIMITS.email);
    validateText(errors, `${prefix}.qq`, qq, "QQ 号", FIELD_LIMITS.qq);
    validateText(errors, `${prefix}.organization`, organization, "学校或组织", FIELD_LIMITS.organization, false);

    if (email && !EMAIL_PATTERN.test(email)) {
      errors.push({ path: `${prefix}.email`, code: "invalid", message: "请输入有效的邮箱地址" });
    }

    if (qq && !QQ_PATTERN.test(qq)) {
      errors.push({ path: `${prefix}.qq`, code: "invalid", message: "QQ 号应为 5–12 位数字且不能以 0 开头" });
    }

    return { realName, email, qq, organization };
  });

  const seenEmails = new Set();
  members.forEach((member, index) => {
    if (member.email && seenEmails.has(member.email)) {
      errors.push({ path: `members.${index}.email`, code: "duplicate", message: "同一团队中不能重复填写邮箱" });
    }
    seenEmails.add(member.email);
  });

  if (raw?.privacyAccepted !== true) {
    errors.push({ path: "privacyAccepted", code: "required", message: "请阅读并同意隐私告知" });
  }

  if (raw?.accuracyConfirmed !== true) {
    errors.push({ path: "accuracyConfirmed", code: "required", message: "请确认报名信息真实准确" });
  }

  if (registrationType === "team" && raw?.teamAuthorization !== true) {
    errors.push({ path: "teamAuthorization", code: "required", message: "请确认已获得所有队员授权" });
  }

  return {
    ok: errors.length === 0,
    errors,
    value: {
      registrationType,
      teamName: registrationType === "team" ? teamName : "",
      members,
    },
  };
}

export function validateIdempotencyKey(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,100}$/.test(value);
}

export function escapeCsvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
