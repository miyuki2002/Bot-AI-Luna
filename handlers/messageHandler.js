const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const NeuralNetworks = require('../services/NeuralNetworks');
const experience = require('../utils/xp');
const logger = require('../utils/logger.js');

/**
 * Xử lý tin nhắn Discord đề cập đến bot
 * @param {Object} message - Đối tượng tin nhắn Discord
 */
async function handleMessage(message) {
  try {
    // Biến để kiểm tra xem lệnh có được thực thi hay không
    let commandExecuted = false;

    // Lấy nội dung mà không có phần đề cập
    const content = message.content
      .replace(/<@!?\d+>/g, '')
      .trim();

    // Nếu không có nội dung, không tiếp tục
    if (!content) {
      await message.reply('Tôi có thể giúp gì cho bạn hôm nay?');
      return;
    }

    // Kiểm tra cấu trúc lệnh trong nội dung
    if (content.startsWith('/image')) {
      await handleImageGeneration(message, content.replace('/image', '').trim());
      commandExecuted = true;
      return;
    }

    // Tìm kiếm yêu cầu cụ thể về mã
    if (content.toLowerCase().includes('code') ||
      content.toLowerCase().includes('function') ||
      content.toLowerCase().includes('write a')) {
      await handleCodeRequest(message, content);
      commandExecuted = true;
      return;
    }

    // Mặc định là phản hồi trò chuyện - luôn truyền message object đầy đủ
    await handleChatRequest(message, content);

    // Xử lý XP sau khi xử lý tin nhắn
    processXp(message, commandExecuted, true);
  } catch (error) {
    logger.error('MESSAGE', `Lỗi khi xử lý tin nhắn từ ${message.author.tag}:`, error);
    await message.reply('Xin lỗi, tôi gặp lỗi khi xử lý yêu cầu của bạn.');

    // Xử lý XP với thông tin rằng có lỗi xảy ra
    processXp(message, false, false);
  }
}

/**
 * Xử lý hệ thống XP cho người dùng
 * @param {Object} message - Đối tượng tin nhắn từ Discord.js
 * @param {Boolean} commandExecuted - Có lệnh nào được thực thi không
 * @param {Boolean} execute - Có nên tiếp tục thực thi không
 */
async function processXp(message, commandExecuted, execute) {
  try {
    const response = await experience(message, commandExecuted, execute);

    // Ghi log lỗi không gây ra bởi lý do đã biết
    if (!response.xpAdded && ![
      'DISABLED',             // XP bị tắt, cần EXPERIENCE_POINTS trong client#features
      'COMMAND_EXECUTED',     // Lệnh đã được thực thi thành công
      'COMMAND_TERMINATED',   // Lệnh đã được tìm nhưng đã bị chấm dứt
      'DM_CHANNEL',           // Tin nhắn được gửi trong DM
      'GUILD_SETTINGS_NOT_FOUND', // Không tìm thấy cài đặt của guild
      'DISABLED_ON_GUILD',    // XP bị tắt trên server này
      'DISABLED_ON_CHANNEL',  // Tin nhắn được gửi trong kênh bị chặn XP
      'RECENTLY_TALKED'       // Người gửi vừa nói gần đây
    ].includes(response.reason)) {
      // Ghi log lỗi nếu có
      if (message.client.logs) {
        message.client.logs.push(`Lỗi XP: ${response.reason} tại ${message.guild.id}<${message.guild.name}> bởi ${message.author.tag}<${message.author.id}> lúc ${new Date()}`);
      } else {
        logger.error('XP', `Lỗi XP: ${response.reason} tại ${message.guild.id}<${message.guild.name}> bởi ${message.author.tag}<${message.author.id}> lúc ${new Date()}`);
      }
    }

    // Nếu người dùng lên cấp, có thể hiển thị thông báo
    if (response.xpAdded && response.level && response.previousLevel && response.level > response.previousLevel) {
      // Tùy chọn: Thông báo người dùng đã lên cấp
      logger.info('XP', `${message.author.tag} đã lên cấp ${response.level} trong server ${message.guild.name}`);

      // Tùy chọn: Gửi thông báo lên cấp trong kênh
      // await message.channel.send(`🎉 Chúc mừng ${message.author}! Bạn đã đạt cấp độ ${response.level}!`);
    }
  } catch (error) {
    logger.error('XP', 'Lỗi khi xử lý XP:', error);
  }
}

/**
 * Xử lý yêu cầu trò chuyện thông thường
 * @param {Object} message - Đối tượng tin nhắn Discord
 * @param {string} content - Nội dung tin nhắn đã xử lý
 */
async function handleChatRequest(message, content) {
  // Hiển thị chỉ báo đang nhập
  await message.channel.sendTyping();

  try {
    // Đảm bảo truyền đối tượng message đầy đủ để có thông tin người dùng chính xác
    const response = await NeuralNetworks.getCompletion(content, message);

    // Chia phản hồi nếu nó quá dài cho Discord
    if (response.length > 2000) {
      const chunks = splitMessageRespectWords(response, 2000);
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } else {
      await message.reply(response);
    }
  } catch (error) {
    logger.error('MESSAGE', `Lỗi khi nhận phản hồi trò chuyện cho ${message.author.tag}:`, error);

    // Thông báo chi tiết hơn về lỗi
    if (error.code === 'EPROTO' || error.code === 'ECONNREFUSED' || error.message.includes('connect')) {
      await message.reply('Xin lỗi, tôi đang gặp vấn đề kết nối với dịch vụ AI. Vui lòng thử lại sau hoặc liên hệ quản trị viên để được hỗ trợ.');
    } else {
      await message.reply('Xin lỗi, tôi gặp khó khăn khi tạo phản hồi. Vui lòng thử lại sau.');
    }
  }
}

/**
 * Xử lý yêu cầu tạo hình ảnh
 */
async function handleImageGeneration(message, prompt) {
  if (!prompt) {
    await message.reply('Vui lòng cung cấp mô tả cho hình ảnh bạn muốn tôi tạo.');
    return;
  }

  await message.channel.sendTyping();

  try {
    // Lấy kết quả hình ảnh từ generateImage của NeuralNetworks
    const imageResult = await NeuralNetworks.generateImage(prompt);

    // Nếu nhận được thông báo lỗi thay vì kết quả
    if (typeof imageResult === 'string') {
      await message.reply(imageResult);
      return;
    }

    // Tạo attachment từ buffer
    const attachment = new AttachmentBuilder(imageResult.buffer, { name: 'generated-image.png' });

    // Tạo embed và gửi trả lời với file đính kèm
    const embed = new EmbedBuilder()
      .setTitle('Hình Ảnh Được Tạo')
      .setDescription(`Mô tả: ${prompt}`)
      .setColor('#0099ff')
      .setTimestamp();

    await message.reply({ 
      embeds: [embed],
      files: [attachment]
    });
  } catch (error) {
    logger.error('IMAGE', 'Lỗi khi tạo hình ảnh:', error);
    await message.reply('Xin lỗi, tôi gặp khó khăn khi tạo hình ảnh đó.');
  }
}

/**
 * Xử lý yêu cầu về mã
 * @param {Object} message - Đối tượng tin nhắn Discord
 * @param {string} prompt - Nội dung tin nhắn đã xử lý
 */
async function handleCodeRequest(message, prompt) {
  await message.channel.sendTyping();

  try {
    // Đảm bảo truyền đối tượng message đầy đủ để có thông tin người dùng chính xác
    const codeResponse = await NeuralNetworks.getCodeCompletion(prompt, message);

    // Trích xuất khối mã hoặc định dạng dưới dạng mã
    let formattedResponse = codeResponse;

    // Nếu phản hồi không chứa khối mã, bọc nó trong một khối
    if (!formattedResponse.includes('```')) {
      formattedResponse = formatCodeResponse(formattedResponse);
    }

    // Chia phản hồi nếu nó quá dài cho Discord
    if (formattedResponse.length > 2000) {
      const chunks = splitMessage(formattedResponse, 2000);
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } else {
      await message.reply(formattedResponse);
    }
  } catch (error) {
    logger.error('CODE', `Lỗi khi nhận mã cho ${message.author.tag}:`, error);
    await message.reply('Xin lỗi, tôi gặp khó khăn khi tạo mã đó.');
  }
}

/**
 * Định dạng phản hồi dưới dạng khối mã nếu nó chưa được định dạng
 */
function formatCodeResponse(text) {
  // Cố gắng phát hiện ngôn ngữ hoặc mặc định là javascript
  let language = 'javascript';

  // Các mẫu ngôn ngữ phổ biến
  const langPatterns = {
    python: /import\s+[\w.]+|def\s+\w+\s*\(|print\s*\(/i,
    javascript: /const|let|var|function|=>|\bif\s*\(|console\.log/i,
    java: /public\s+class|void\s+main|System\.out|import\s+java/i,
    html: /<html|<div|<body|<head|<!DOCTYPE/i,
    css: /body\s*{|margin:|padding:|color:|@media/i,
    php: /<\?php|\$\w+\s*=/i
  };

  // Phát hiện ngôn ngữ
  for (const [lang, pattern] of Object.entries(langPatterns)) {
    if (pattern.test(text)) {
      language = lang;
      break;
    }
  }

  return `\`\`\`${language}\n${text}\n\`\`\``;
}

/**
 * Chia tin nhắn thành các phần nhỏ hơn
 */
function splitMessage(text, maxLength = 2000) {
  const chunks = [];

  // Xử lý đặc biệt cho khối mã
  if (text.includes('```')) {
    // Chia theo khối mã và kết hợp lại để tránh làm gián đoạn chúng
    const parts = text.split(/(```(?:\w+)?\n[\s\S]*?```)/g);

    let currentChunk = '';

    for (const part of parts) {
      if (currentChunk.length + part.length > maxLength) {
        chunks.push(currentChunk);
        currentChunk = part;
      } else {
        currentChunk += part;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }
  } else {
    // Chia đơn giản cho tin nhắn không phải mã
    for (let i = 0; i < text.length; i += maxLength) {
      chunks.push(text.substring(i, i + maxLength));
    }
  }

  return chunks;
}

/**
 * Chia tin nhắn thành các phần nhỏ hơn, tôn trọng ranh giới từ
 * để không cắt từ giữa chừng
 */
function splitMessageRespectWords(text, maxLength = 2000) {
  const chunks = [];

  // Xử lý đặc biệt cho khối mã
  if (text.includes('```')) {
    // Chia theo khối mã và kết hợp lại để tránh làm gián đoạn chúng
    const parts = text.split(/(```(?:\w+)?\n[\s\S]*?```)/g);

    let currentChunk = '';

    for (const part of parts) {
      if (currentChunk.length + part.length > maxLength) {
        chunks.push(currentChunk);
        currentChunk = part;
      } else {
        currentChunk += part;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }
  } else {
    // Chia thông minh theo ranh giới từ cho tin nhắn không phải mã
    let startPos = 0;

    while (startPos < text.length) {
      // Nếu đoạn còn lại ngắn hơn maxLength, lấy hết
      if (startPos + maxLength >= text.length) {
        chunks.push(text.substring(startPos));
        break;
      }

      // Tìm vị trí khoảng trắng gần nhất gần maxLength
      let endPos = startPos + maxLength;
      while (endPos > startPos && text[endPos] !== ' ' && text[endPos] !== '\n') {
        endPos--;
      }

      // Nếu không tìm thấy khoảng trắng, buộc phải cắt ở maxLength
      if (endPos === startPos) {
        endPos = startPos + maxLength;
      } else {
        // Nếu tìm thấy khoảng trắng, lấy hết khoảng trắng đó
        endPos++;
      }

      chunks.push(text.substring(startPos, endPos));
      startPos = endPos;
    }
  }

  return chunks;
}

/**
 * Hàm chính xử lý sự kiện MessageCreate khi bot được đề cập
 * @param {import('discord.js').Message} message - Đối tượng tin nhắn Discord
 * @param {import('discord.js').Client} client - Client Discord.js
 */
async function handleMentionMessage(message, client) {
  // Bỏ qua tin nhắn từ bot
  if (message.author.bot) return;

  // Chỉ xử lý tin nhắn khi bot được tag trực tiếp
  if (message.mentions.has(client.user)) {
    // Kiểm tra xem tin nhắn có mention @everyone hoặc @role không
    const hasEveryoneOrRoleMention = message.mentions.everyone || message.mentions.roles.size > 0;

    // Kiểm tra xem tin nhắn có phải là cảnh báo từ chức năng giám sát không
    const isMonitorWarning = message.content.includes('**CẢNH BÁO') ||
                            message.content.includes('**Lưu ý') ||
                            message.content.includes('**CẢNH BÁO NGHÊM TRỌNG');

    // Nếu không phải cảnh báo từ chức năng giám sát và không có mention @everyone hoặc @role,
    // xử lý như tin nhắn trò chuyện bình thường bằng hàm handleMessage
    if (!isMonitorWarning && !hasEveryoneOrRoleMention) {
      // Thêm thông tin người dùng vào log để gỡ lỗi
      logger.info('CHAT', `Xử lý tin nhắn trò chuyện từ ${message.author.tag} (ID: ${message.author.id})`);
      logger.info('CHAT', `Kênh: ${message.channel.type === 'DM' ? 'DM' : message.channel.name} trong ${message.guild ? message.guild.name : 'DM'}`);
      logger.info('CHAT', `Nội dung: ${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}`);
      
      try {
        // Đảm bảo rằng chúng ta truyền đối tượng message để có thể lấy ID người dùng chính xác
        await handleMessage(message); 
        logger.info('CHAT', `Đã xử lý tin nhắn trò chuyện thành công cho ${message.author.tag}`);
      } catch (error) {
        logger.error('CHAT', `Lỗi khi xử lý tin nhắn trò chuyện từ ${message.author.tag}:`, error);
        // Phản hồi lỗi cho người dùng 
        await message.reply('Xin lỗi, đã có lỗi xảy ra khi xử lý yêu cầu của bạn. Vui lòng thử lại sau.');
      }
    } else if (hasEveryoneOrRoleMention) {
      logger.debug('CHAT', `Bỏ qua tin nhắn có mention @everyone hoặc @role từ ${message.author.tag}`);
    } else if (isMonitorWarning) {
      logger.debug('CHAT', `Bỏ qua tin nhắn cảnh báo từ monitor từ ${message.author.tag}`);
    }
  }
}

module.exports = {
  handleMessage, // Giữ lại export này nếu cần dùng ở nơi khác
  handleMentionMessage, // Export hàm mới
  processXp,
  splitMessage,
  splitMessageRespectWords // Export the splitMessageRespectWords function
};
