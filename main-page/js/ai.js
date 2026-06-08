/**
 * @file ai.js
 * @description Logic tích hợp Gemini AI (Tự động viết tiếp, tối ưu hóa giọng điệu, sinh kịch bản và chuẩn hóa danh bạ).
 * RÀNG BUỘC: Giữ nguyên prompt, model và logic cấu hình nguyên bản, không tự ý chỉnh sửa.
 */

/**
 * Thực hiện gọi API của Gemini LLM thông qua Endpoint chuẩn.
 * @param {string} systemInstruction - Chỉ dẫn hệ thống
 * @param {string} userPrompt - Yêu cầu người dùng
 * @param {Object} [schema=null] - JSON Schema tùy chọn
 * @returns {Promise<string>} Kết quả dạng văn bản
 */
async function callGeminiAPI(systemInstruction, userPrompt, schema = null) {
  if (!apiKey) {
    throw new Error("Vui lòng cấu hình Gemini API Key trên thanh công cụ!");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] }
  };

  if (schema) {
    payload.generationConfig = {
      responseMimeType: "application/json",
      responseSchema: schema
    };
  }

  let delay = 1000;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }
    } catch (error) {
      console.error("Gemini attempt error:", error);
    }
    await new Promise(resolve => setTimeout(resolve, delay));
    delay *= 2;
  }
  throw new Error("Không kết nối được với Gemini AI. Hãy thử lại sau.");
}

/**
 * AI Viết tiếp nội dung tin nhắn đang nhập thô.
 */
async function aiAutocompleteMessage() {
  const messageInput = document.getElementById("composerMessage");
  if (!messageInput) return;
  const currentMessage = messageInput.value.trim();
  const loader = document.getElementById("aiImproverLoader");

  if (!currentMessage) {
    showToast("Vui lòng nhập một đoạn tin nhắn thô để AI viết tiếp!", "error");
    messageInput.focus();
    return;
  }

  loader?.classList.remove("hidden");

  const systemInstruction = `Bạn là trợ lý viết tin nhắn thông minh gửi khách hàng qua Zalo/SMS.
Hãy viết tiếp 1 hoặc 2 câu tiếp theo một cách tự nhiên, hấp dẫn và giữ vững mạch logic dựa trên đoạn gốc của người dùng.
QUY TẮC BẮT BUỘC:
- Chỉ trả về đoạn văn viết tiếp (Không lặp lại đoạn gốc của người dùng, không thêm bất kỳ văn bản giải thích hoặc dẫn dắt nào).
- Có thể dùng các thẻ biến cá nhân hóa {a} hoặc {n} nếu cần thiết.`;

  try {
    const nextText = await callGeminiAPI(systemInstruction, currentMessage);
    if (nextText) {
      messageInput.value = messageInput.value + " " + nextText.trim();
      messageInput.dispatchEvent(new Event('input'));
      showToast("✨ AI đã viết tiếp tin nhắn thành công!");
    }
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    loader?.classList.add("hidden");
  }
}

/**
 * AI Viết lại tin nhắn theo Tone giọng yêu cầu.
 * @param {string} tone - Tone giọng: formal | friendly | sales | short
 */
async function aiRewriteMessage(tone) {
  if (!tone) return;
  const messageInput = document.getElementById("composerMessage");
  if (!messageInput) return;
  const currentMessage = messageInput.value.trim();
  const loader = document.getElementById("aiImproverLoader");

  if (!currentMessage) {
    showToast("Vui lòng nhập văn bản thô để tối ưu hóa!", "error");
    messageInput.focus();
    return;
  }

  loader?.classList.remove("hidden");

  const tonePrompts = {
    formal: "Trang trọng, chuyên nghiệp, lịch sự.",
    friendly: "Thân thiện, ấm áp và gần gũi.",
    sales: "Thuyết phục, có tính kích thích mua hàng (Sales copywriting).",
    short: "Cực kỳ ngắn gọn, trực diện và súc tích."
  };

  const systemInstruction = `Bạn là trợ lý AI chuyên nghiệp. Hãy viết lại tin nhắn sau theo phong cách: ${tonePrompts[tone]}.
QUY TẮC: Phải giữ nguyên cấu trúc các thẻ {a} và {n}. Chỉ trả về nội dung đã cải tiến, không giải thích gì thêm.`;

  try {
    const responseText = await callGeminiAPI(systemInstruction, currentMessage);
    if (responseText) {
      messageInput.value = responseText.trim();
      messageInput.dispatchEvent(new Event('input'));
      showToast("✨ AI đã tối ưu hóa tin nhắn!");
    }
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    loader?.classList.add("hidden");
    const toneSelect = document.getElementById("aiToneSelect");
    if (toneSelect) toneSelect.value = "";
  }
}

/**
 * Trợ lý Kịch bản AI sinh 3 kịch bản từ Prompt ý tưởng chiến dịch.
 */
async function generateAiCampaignIdeas() {
  const promptInput = document.getElementById("aiPromptInput");
  if (!promptInput) return;
  const promptVal = promptInput.value.trim();
  const loading = document.getElementById("aiIdeasLoading");
  const container = document.getElementById("aiIdeasContainer");

  if (!promptVal) {
    showToast("Vui lòng nhập mô tả kịch bản mong muốn!", "error");
    return;
  }

  loading?.classList.remove("hidden");
  if (container) container.innerHTML = "";

  const systemInstruction = `Tạo đúng 3 kịch bản tin nhắn khác nhau theo nhu cầu của người dùng.
Yêu cầu bắt buộc: Phải có chứa các biến cá nhân hóa {a} (xưng hô) và {n} (tên riêng). 
Trả về JSON nghiêm ngặt khớp với cấu trúc Schema cung cấp.`;

  const schema = {
    type: "OBJECT",
    properties: {
      ideas: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            content: { type: "STRING" }
          },
          required: ["title", "content"]
        }
      }
    },
    required: ["ideas"]
  };

  try {
    const responseJsonText = await callGeminiAPI(systemInstruction, promptVal, schema);
    const data = JSON.parse(responseJsonText);

    if (data && data.ideas && container) {
      container.innerHTML = data.ideas.map((idea, index) => {
        return `
          <div class="p-2.5 bg-slate-850 rounded border border-slate-700 space-y-1.5 text-xs text-slate-100">
            <div class="flex justify-between items-center">
              <span class="text-[10px] font-bold text-indigo-400 uppercase">Mẫu ${index + 1}: ${escapeHtml(idea.title)}</span>
              <button 
                type="button"
                class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-1.5 py-0.5 rounded text-[9px] transition-all"
                data-content="${encodeURIComponent(idea.content)}"
              >
                Sử dụng
              </button>
            </div>
            <p class="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">${escapeHtml(idea.content)}</p>
          </div>
        `;
      }).join("");

      // Gắn sự kiện click cho button "Sử dụng"
      container.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const content = decodeURIComponent(btn.dataset.content);
          const composerMsg = document.getElementById("composerMessage");
          const charCount = document.getElementById("composerCharCount");
          if (composerMsg) {
            composerMsg.value = content;
            composerMsg.dispatchEvent(new Event('input'));
          }
          if (charCount) charCount.innerText = `${content.length} ký tự`;
          toggleAiDrawer(false);
          showToast("Đã chuyển kịch bản AI vào ô soạn thảo!");
        });
      });
      showToast("✨ Đã phác thảo kịch bản thành công!");
    }
  } catch (error) {
    showToast("Không thể sinh nội dung. Thử mô tả rõ hơn.", "error");
  } finally {
    loading?.classList.add("hidden");
  }
}

/**
 * AI Chuẩn hóa Danh bạ đồng loạt (Đề xuất Xưng hô, Tên và Tag nhóm).
 */
async function runAiNormalizer() {
  const tbody = document.getElementById("aiNormalizerPreviewBody");
  const runBtn = document.getElementById("btnRunAiNormalizer");
  const statusLabel = document.getElementById("aiNormalizerStatus");
  const applyBtn = document.getElementById("btnApplyAiNormalizer");

  if (!latestContacts.length) {
    showToast("Không có danh bạ để phân tích!", "error");
    return;
  }

  if (runBtn) {
    runBtn.setAttribute("disabled", "true");
    runBtn.innerHTML = `<span>⏳</span> Đang xử lý...`;
  }
  
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-10">
          <p class="text-xs text-indigo-600 font-bold animate-pulse">Gemini đang phân tích bóc tách danh bạ của bạn...</p>
        </td>
      </tr>
    `;
  }

  const contactsToAnalyze = latestContacts.map(c => ({
    displayName: c.display_name || "",
    phone: c.phone
  }));

  const systemInstruction = `Phân tích danh sách đối tác Việt Nam chứa displayName để:
1. Dự đoán xưng xô thân mật phù hợp nhất: "anh", "chị", "em" hoặc "bạn".
2. Bóc tách Tên riêng gọi thân mật (Ví dụ: "C Loan - HN" -> "Loan". Nếu không có tên, để trống).
3. Đề xuất một nhãn (tag) phân nhóm ngắn gọn (Bạn bè, Gia định, VIP, Đối tác, Khách hàng).
4. Mã màu tag dạng HEX hợp lệ.
5. Sửa lỗi chính tả tên displayname nếu cần thiết.
Trả về JSON khớp với Schema được cung cấp.`;

  const schema = {
    type: "OBJECT",
    properties: {
      results: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            phone: { type: "STRING" },
            ac: { type: "STRING" },
            name: { type: "STRING" },
            tag: { type: "STRING" },
            tagColor: { type: "STRING" }
          },
          required: ["phone", "ac", "name", "tag", "tagColor"]
        }
      }
    },
    required: ["results"]
  };

  try {
    const responseJsonText = await callGeminiAPI(systemInstruction, JSON.stringify(contactsToAnalyze), schema);
    const data = JSON.parse(responseJsonText);

    if (data && data.results && tbody) {
      aiNormalizerResultsCache = data.results;

      tbody.innerHTML = latestContacts.map(c => {
        const aiProp = aiNormalizerResultsCache.find(r => r.phone === c.phone);
        const proposedAc = aiProp ? aiProp.ac : "bạn";
        const proposedName = aiProp ? aiProp.name : "";
        const proposedTag = aiProp ? aiProp.tag : "";
        const proposedColor = aiProp ? aiProp.tagColor : "#64748b";

        return `
          <tr class="hover:bg-slate-50 text-[11px]">
            <td class="px-2.5 py-2 font-medium text-slate-800">${escapeHtml(c.display_name || '')}</td>
          <td class="px-2.5 py-2 font-mono text-slate-400">${escapeHtml(formatDisplayPhone(c.phone))}</td>
            <td class="px-2.5 py-2">
              <span class="font-bold text-violet-700">${escapeHtml(proposedAc)}</span>
            </td>
            <td class="px-2.5 py-2">
              <span class="font-bold text-indigo-700">${escapeHtml(proposedName || "—")}</span>
            </td>
            <td class="px-2.5 py-2">
              <span class="px-1.5 py-0.5 text-[9px] text-white rounded font-extrabold" style="background-color: ${escapeHtml(proposedColor)}">${escapeHtml(proposedTag)}</span>
            </td>
          </tr>
        `;
      }).join("");

      if (statusLabel) {
        statusLabel.innerHTML = `<span class="text-emerald-600 text-xs">✓ Đã phân tích đề xuất chuẩn hóa ${aiNormalizerResultsCache.length} số.</span>`;
      }
      applyBtn?.classList.remove("hidden");
    }
  } catch (error) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-10 text-rose-600 font-bold">
            Không thể phân tích dữ liệu. Vui lòng kiểm tra lại cấu hình API Key.
          </td>
        </tr>
      `;
    }
  } finally {
    if (runBtn) {
      runBtn.removeAttribute("disabled");
      runBtn.innerHTML = `<span>✨</span> AI phân tích`;
    }
  }
}

/**
 * Lưu kết quả chuẩn hóa AI vào Database liên hệ của Extension.
 */
async function applyAiNormalizerResults() {
  if (aiNormalizerResultsCache.length === 0) return;

  let appliedCount = 0;

  for (const aiItem of aiNormalizerResultsCache) {
    const contact = latestContacts.find(c => c.phone === aiItem.phone);
    if (contact) {
      const response = await sendMessage({
        type: 'TAG_CONTACTS_BY_PHONES',
        phones: [aiItem.phone],
        tag: aiItem.tag,
        color: aiItem.tagColor
      });

      if (response.ok) {
        appliedCount++;
      }
    }
  }

  closeAiNormalizerModal();
  showToast(`✨ Đã áp dụng thành công dữ liệu chuẩn hóa cho ${appliedCount} số!`);
  await loadContacts();
}
