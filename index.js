const fs = require("fs");

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

// =========================
// 환경변수 (배포용 핵심)
// =========================
const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.log("❌ TOKEN 환경변수가 없습니다!");
  console.log("호스팅 사이트에서 TOKEN을 환경변수로 등록해야 합니다.");
  process.exit(1);
}

// =========================
// 서버별 설정 저장 파일
// =========================
const SETTINGS_FILE = "./guildSettings.json";

if (!fs.existsSync(SETTINGS_FILE)) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({}, null, 2));
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch (e) {
    return {};
  }
}

function saveSettings(data) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

// =========================
// 봇 생성
// =========================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// 버튼 쿨타임
const cooldown = new Map();

// =========================
// 슬래시 명령어
// =========================
const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("이 서버에서 인증봇 설정을 저장합니다. (관리자용)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((opt) =>
      opt
        .setName("verified_role")
        .setDescription("인증 완료 시 지급할 역할")
        .setRequired(true)
    )
    .addChannelOption((opt) =>
      opt
        .setName("log_channel")
        .setDescription("인증 로그를 남길 채널")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("인증 버튼 패널을 설치합니다. (관리자용)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("이 서버의 설정을 확인합니다. (관리자용)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("reset")
    .setDescription("이 서버의 설정을 초기화합니다. (관리자용)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map((c) => c.toJSON());

// =========================
// 봇 준비 완료
// =========================
client.once(Events.ClientReady, async () => {
  console.log(`✅ 로그인됨: ${client.user.tag}`);

  // 전역 명령어 등록 (공개봇)
  // 반영까지 최대 1시간 걸릴 수 있음
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    console.log("⏳ 전역 슬래시 명령어 등록 중...");
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ 전역 슬래시 명령어 등록 완료!");
  } catch (err) {
    console.error("❌ 전역 명령어 등록 실패:", err);
  }
});

// =========================
// 인터랙션 처리
// =========================
client.on(Events.InteractionCreate, async (interaction) => {
  // -------------------------
  // 슬래시 명령어
  // -------------------------
  if (interaction.isChatInputCommand()) {
    const guildId = interaction.guildId;
    const allSettings = loadSettings();

    // /setup
    if (interaction.commandName === "setup") {
      const verifiedRole = interaction.options.getRole("verified_role");
      const logChannel = interaction.options.getChannel("log_channel");

      if (!logChannel || !logChannel.isTextBased()) {
        return interaction.reply({
          content: "❌ 로그 채널은 텍스트 채널이어야 해요!",
          ephemeral: true
        });
      }

      allSettings[guildId] = {
        verifiedRoleId: verifiedRole.id,
        logChannelId: logChannel.id
      };

      saveSettings(allSettings);

      return interaction.reply({
        content:
          "✅ 설정 저장 완료!\n" +
          `- 인증 역할: **${verifiedRole.name}**\n` +
          `- 로그 채널: <#${logChannel.id}>\n\n` +
          "이제 `/panel`을 실행해서 인증 버튼을 설치하세요!",
        ephemeral: true
      });
    }

    // /panel
    if (interaction.commandName === "panel") {
      const s = allSettings[guildId];

      if (!s) {
        return interaction.reply({
          content: "⚠️ 먼저 `/setup`으로 설정부터 해야 해요!",
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🔐 서버 인증")
        .setDescription(
          "1) `📜 규칙 동의` 버튼을 눌러주세요.\n" +
          "2) `✅ 인증하기` 버튼을 눌러주세요.\n\n" +
          "인증 후 서버 채널 이용이 가능해요!"
        )
        .setColor(0x3399ff);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("agree_rules")
          .setLabel("📜 규칙 동의")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("verify_user")
          .setLabel("✅ 인증하기")
          .setStyle(ButtonStyle.Success)
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });

      return interaction.reply({
        content: "✅ 인증 패널을 설치했어요!",
        ephemeral: true
      });
    }

    // /status
    if (interaction.commandName === "status") {
      const s = allSettings[guildId];

      if (!s) {
        return interaction.reply({
          content: "⚠️ 이 서버는 아직 설정이 없어요. `/setup`부터 하세요!",
          ephemeral: true
        });
      }

      return interaction.reply({
        content:
          "📌 현재 저장된 설정\n" +
          `- 인증 역할: <@&${s.verifiedRoleId}>\n` +
          `- 로그 채널: <#${s.logChannelId}>`,
        ephemeral: true
      });
    }

    // /reset
    if (interaction.commandName === "reset") {
      if (allSettings[guildId]) {
        delete allSettings[guildId];
        saveSettings(allSettings);
      }

      return interaction.reply({
        content: "🧹 이 서버의 설정을 초기화했어요!",
        ephemeral: true
      });
    }
  }

  // -------------------------
  // 버튼 처리
  // -------------------------
  if (interaction.isButton()) {
    const userId = interaction.user.id;

    // 쿨타임 3초
    const now = Date.now();
    const last = cooldown.get(userId) || 0;

    if (now - last < 3000) {
      return interaction.reply({
        content: "⏱️ 너무 빨리 눌렀어요! 잠깐만요.",
        ephemeral: true
      });
    }
    cooldown.set(userId, now);

    const guildId = interaction.guildId;
    const guild = interaction.guild;
    const member = interaction.member;

    const allSettings = loadSettings();
    const s = allSettings[guildId];

    if (!s) {
      return interaction.reply({
        content: "⚠️ 이 서버는 아직 봇 설정이 안 되어 있어요. 관리자에게 `/setup` 요청하세요!",
        ephemeral: true
      });
    }

    // 규칙 동의 버튼
    if (interaction.customId === "agree_rules") {
      return interaction.reply({
        content: "📜 규칙 동의 완료! 이제 `✅ 인증하기` 버튼을 눌러주세요.",
        ephemeral: true
      });
    }

    // 인증 버튼
    if (interaction.customId === "verify_user") {
      const verifiedRole = guild.roles.cache.get(s.verifiedRoleId);

      if (!verifiedRole) {
        return interaction.reply({
          content: "❌ 인증 역할을 찾을 수 없어요. 관리자에게 문의하세요.",
          ephemeral: true
        });
      }

      // 이미 인증됨
      if (member.roles.cache.has(s.verifiedRoleId)) {
        return interaction.reply({
          content: "✅ 이미 인증되어 있어요!",
          ephemeral: true
        });
      }

      // 역할 지급
      try {
        await member.roles.add(verifiedRole);
      } catch (err) {
        console.error("역할 지급 실패:", err);
        return interaction.reply({
          content:
            "❌ 역할 지급에 실패했어요.\n" +
            "봇 역할이 인증 역할보다 위에 있는지 + 역할 관리 권한이 있는지 확인해 주세요!",
          ephemeral: true
        });
      }

      // DM 안내
      try {
        await interaction.user.send(
          "✅ 인증 완료!\n\n" +
          "🎉 서버에 오신 걸 환영해요!\n" +
          "📌 공지/규칙 채널도 한 번 확인해 주세요!"
        );
      } catch (e) {}

      // 로그 남기기
      const logChannel = guild.channels.cache.get(s.logChannelId);
      if (logChannel && logChannel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle("✅ 인증 완료")
          .addFields(
            { name: "유저", value: `${interaction.user.tag} (${interaction.user.id})` },
            { name: "시간", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
          )
          .setColor(0x00ff99);

        logChannel.send({ embeds: [embed] });
      }

      return interaction.reply({
        content: "✅ 인증 완료! 서버 이용이 가능해졌어요.",
        ephemeral: true
      });
    }

    return interaction.reply({
      content: "❌ 알 수 없는 버튼이에요.",
      ephemeral: true
    });
  }
});

// =========================
// 실행
// =========================
client.login(TOKEN);
