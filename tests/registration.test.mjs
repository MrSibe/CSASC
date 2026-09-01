import test from "node:test";
import assert from "node:assert/strict";
import {
  TEAM_MAX_MEMBERS,
  escapeCsvCell,
  normalizeEmail,
  validateIdempotencyKey,
  validateRegistrationPayload,
} from "../shared/registration.mjs";

const member = (index = 1) => ({
  realName: `成员${index}`,
  email: `member${index}@example.com`,
  qq: `${123450 + index}`,
  organization: index % 2 ? "观测学校" : "",
});
const individualPayload = () => ({
  registrationType: "individual",
  teamName: "",
  members: [member()],
  privacyAccepted: true,
  accuracyConfirmed: true,
  teamAuthorization: false,
});

test("accepts a complete individual registration", () => {
  const result = validateRegistrationPayload(individualPayload());
  assert.equal(result.ok, true);
  assert.equal(result.value.members.length, 1);
});

test("accepts teams at the 2 and 9 member boundaries", () => {
  for (const count of [2, TEAM_MAX_MEMBERS]) {
    const result = validateRegistrationPayload({
      ...individualPayload(),
      registrationType: "team",
      teamName: "猎户座巡天队",
      members: Array.from({ length: count }, (_, index) => member(index + 1)),
      teamAuthorization: true,
    });
    assert.equal(result.ok, true, `${count} members should be valid`);
  }
});

test("rejects teams outside the 2 to 9 member range", () => {
  for (const count of [1, 10]) {
    const result = validateRegistrationPayload({
      ...individualPayload(),
      registrationType: "team",
      teamName: "越界队伍",
      members: Array.from({ length: count }, (_, index) => member(index + 1)),
      teamAuthorization: true,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.path === "members" && error.code === "invalid_count"));
  }
});

test("normalizes email and rejects duplicate team members", () => {
  assert.equal(normalizeEmail("  PERSON@Example.COM "), "person@example.com");
  const result = validateRegistrationPayload({
    ...individualPayload(),
    registrationType: "team",
    teamName: "重复邮箱队",
    members: [member(1), { ...member(2), email: " MEMBER1@example.com " }],
    teamAuthorization: true,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "duplicate"));
});

test("requires consent and valid member fields", () => {
  const result = validateRegistrationPayload({
    ...individualPayload(),
    members: [{ realName: "", email: "bad", qq: "0123", organization: "" }],
    privacyAccepted: false,
    accuracyConfirmed: false,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.path === "privacyAccepted"));
  assert.ok(result.errors.some((error) => error.path === "members.0.email"));
  assert.ok(result.errors.some((error) => error.path === "members.0.qq"));
});

test("validates idempotency keys", () => {
  assert.equal(validateIdempotencyKey("ef08e365-9b12-47ce-b998-148271acbbd6"), true);
  assert.equal(validateIdempotencyKey("short"), false);
  assert.equal(validateIdempotencyKey("invalid key with spaces 12345"), false);
});

test("escapes formulas, quotes and commas in CSV cells", () => {
  assert.equal(escapeCsvCell("=1+1"), '"\'=1+1"');
  assert.equal(escapeCsvCell('队名, "星辰"'), '"队名, ""星辰"""');
});
