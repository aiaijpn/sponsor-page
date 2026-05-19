const MEMBERS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1oW-ky7ddt6a9T39t2Ld4rDYh7H-_vQzzSG5PRuUJvPU/gviz/tq?tqx=out:csv&sheet=members";

const SNS_FIELDS = [
  ["instagram_url", "Instagram"],
  ["x_url", "X"],
  ["twitter_url", "X"],
  ["facebook_url", "Facebook"],
  ["youtube_url", "YouTube"],
  ["tiktok_url", "TikTok"],
  ["note_url", "note"],
  ["linkedin_url", "LinkedIn"],
];

document.addEventListener("DOMContentLoaded", loadMember);

async function loadMember() {
  const memberId = new URLSearchParams(window.location.search).get("id")?.trim();
  console.log("[member] target id:", memberId);

  if (!memberId) {
    showError("メンバーIDが指定されていません。");
    return;
  }

  try {
    const response = await fetch(MEMBERS_CSV_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("CSVを取得できませんでした。");
    }

    const csvText = await response.text();
    console.log("[member] CSV first 300 chars:", csvText.slice(0, 300));

    if (/^\s*</.test(csvText)) {
      console.warn("[member] CSV response appears to be HTML:", csvText.slice(0, 300));
    }

    const rows = parseCsv(csvText);
    console.log("[member] parsed CSV rows:", rows);

    const allMembers = rowsToObjects(rows);
    console.log("[member] data rows:", allMembers);

    allMembers.forEach((member, index) => {
      console.log("[member] row", index, {
        member_id: getValue(member, "member_id"),
        active: getValue(member, "active"),
        activeNormalized: normalizeBoolean(getValue(member, "active")),
      });
    });

    const visibleMembers = allMembers.filter((member) => {
      const active = getValue(member, "active");
      return normalizeBoolean(active);
    });
    console.log("[member] visible rows:", visibleMembers);

    const members = visibleMembers.filter((member) => {
      return getValue(member, "member_id") === memberId;
    });

    let matchedMember = members[0];

    if (!matchedMember) {
      matchedMember = allMembers.find((member) => {
        return getValue(member, "member_id") === memberId;
      });

      if (matchedMember) {
        console.warn("[member] matched by member_id while active is not truthy:", {
          member_id: getValue(matchedMember, "member_id"),
          active: getValue(matchedMember, "active"),
        });
      }
    }

    if (!matchedMember) {
      showError("該当するメンバーが見つかりませんでした。");
      return;
    }

    renderMember(matchedMember);
  } catch (error) {
    showError(error.message || "メンバー情報の読み込みに失敗しました。");
  }
}

function rowsToObjects(rows) {
  if (rows.length < 3) return [];

  const keys = rows[0].map((key) => String(key || "").trim());
  return rows.slice(2).map((row) => {
    const item = {};
    keys.forEach((key, index) => {
      if (key) item[key] = row[index] || "";
    });
    return item;
  });
}

function renderMember(member) {
  setText("memberName", getDisplayName(member));

  const genre = firstValue(member, ["genre", "category"]);
  setOptionalText("memberGenre", genre);

  const meta = [getValue(member, "company_name"), getValue(member, "person_name"), getValue(member, "role_title")]
    .filter(Boolean)
    .join(" / ");
  setOptionalText("memberMeta", meta);

  setOptionalText("memberLead", firstValue(member, ["short_description", "description"]));

  renderVideo(member);
  renderLinks(member);
  renderContent("businessSection", "businessText", firstValue(member, ["business_summary", "service_summary"]));
  renderContent("detailSection", "detailText", firstValue(member, ["detail_description", "profile_text"]));
  renderContent("examplesSection", "examplesText", firstValue(member, ["consultation_examples", "consultation_example", "recommended_for"]));

  document.title = getDisplayName(member);
  hide("loadingState");
  show("memberContent");
}

function renderVideo(member) {
  const videoUrl = getValue(member, "video_url");
  if (!videoUrl) return;

  setText("videoTitle", getValue(member, "video_title") || "紹介動画");
  setOptionalText("videoDescription", getValue(member, "video_description"));

  const button = document.getElementById("videoButton");
  button.href = videoUrl;
  button.textContent = getValue(member, "video_cta_label") || "紹介動画を見る";

  show("videoSection");
}

function renderLinks(member) {
  const links = [
    ["company_url", "公式サイト"],
    ["contact_url", "問い合わせ・予約"],
    ...SNS_FIELDS,
  ]
    .map(([field, label]) => ({ url: getValue(member, field), label }))
    .filter((link) => link.url);

  if (links.length === 0) return;

  const container = document.getElementById("supportLinks");
  container.innerHTML = "";

  links.forEach((link) => {
    const anchor = document.createElement("a");
    anchor.className = "support-link";
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = link.label;
    container.appendChild(anchor);
  });

  show("linksSection");
}

function renderContent(sectionId, textId, value) {
  if (!value) return;
  setText(textId, value);
  show(sectionId);
}

function getDisplayName(member) {
  return firstValue(member, ["display_name", "member_name", "company_name", "person_name"]) || "メンバー紹介";
}

function firstValue(item, keys) {
  for (const key of keys) {
    const value = getValue(item, key);
    if (value) return value;
  }
  return "";
}

function getValue(item, key) {
  return String((item && item[key]) || "").trim();
}

function normalizeBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["true", "1", "yes", "y", "on", "checked", "✓", "◯", "○"].includes(normalized);
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function setOptionalText(id, value) {
  if (!value) return;
  setText(id, value);
  show(id);
}

function show(id) {
  document.getElementById(id).classList.remove("hidden");
}

function hide(id) {
  document.getElementById(id).classList.add("hidden");
}

function showError(message) {
  hide("loadingState");
  const errorState = document.getElementById("errorState");
  errorState.textContent = message;
  errorState.classList.remove("hidden");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}
