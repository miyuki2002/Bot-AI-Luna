const NeuralNetworks = require('../services/NeuralNetworks');
const mongoClient = require('../services/mongoClient.js');
const storageDB = require('../services/storagedb.js');
const initSystem = require('../services/initSystem.js');
const ProfileDB = require('../services/profiledb.js');
const GuildProfileDB = require('../services/guildprofiledb.js');

async function startbot(client, loadCommands) {
  client.once('ready', async () => {
    console.log('\x1b[35m%s\x1b[0m', `
    ██╗     ██╗   ██╗███╗   ██╗ █████╗ 
    ██║     ██║   ██║██╔██╗ ██║███████║
    ██║     ██║   ██║██║╚██╗██║██╔══██║
    ███████╗╚██████╔╝██║ ╚████║██║  ██║
    ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝
    `);

    try {
      // Kết nối MongoDB khi bot sẵn sàng
      console.log(`🔄 Đang kết nối đến MongoDB...`);
      await mongoClient.connect();

      // Khởi tạo cài đặt cho StorageDB sau khi kết nối
      await storageDB.setupCollections();

      // Đánh dấu MongoDB đã sẵn sàng
      initSystem.markReady('mongodb');

      console.log(`✅ Đã kết nối thành công đến MongoDB!`);
    } catch (error) {
      console.error('❌ Lỗi khi khởi tạo kết nối MongoDB:', error);
      // Force mark MongoDB as ready even with error
      initSystem.markReady('mongodb');
      console.warn('⚠️ Bot sẽ hoạt động mà không có khả năng lưu trữ lâu dài. Một số tính năng có thể không hoạt động chính xác.');
    }

    try {
      // Khởi tạo cấu trúc lịch sử cuộc trò chuyện
      await storageDB.initializeConversationHistory();
      console.log('✅ Đã khởi tạo cấu trúc lịch sử cuộc trò chuyện');
      initSystem.markReady('conversationHistory');
    } catch (error) {
      console.error('❌ Lỗi khi khởi tạo cấu trúc lịch sử cuộc trò chuyện:', error);
      initSystem.markReady('conversationHistory'); // Đánh dấu là đã sẵn sàng ngay cả khi có lỗi
    }

    try {
      // Khởi tạo profile system
      console.log('🔄 Đang khởi tạo hệ thống profile người dùng...');
      await storageDB.initializeProfiles();
      
      // Kiểm tra truy cập đến profile collection
      const profileCollection = await ProfileDB.getProfileCollection();
      console.log('✅ Đã thiết lập collection user_profiles và cấu trúc dữ liệu');
      
      // Tạo thêm index cho các trường thường xuyên truy vấn
      const db = mongoClient.getDb();
      // Tạo index cho trường global_xp để tăng tốc độ truy vấn bảng xếp hạng
      await db.collection('user_profiles').createIndex({ 'data.global_xp': -1 });
      // Tạo index cho trường xp.id để tìm kiếm nhanh theo guild
      await db.collection('user_profiles').createIndex({ 'data.xp.id': 1 });
      console.log('✅ Đã khởi tạo các index cho collection user_profiles');
      
      initSystem.markReady('profiles');
    } catch (error) {
      console.error('❌ Lỗi khi khởi tạo hệ thống profile người dùng:', error);
      initSystem.markReady('profiles'); // Đánh dấu là đã sẵn sàng ngay cả khi có lỗi
    }

    try {
      // Khởi tạo guild profile system
      console.log('🔄 Đang khởi tạo hệ thống profile guild...');
      
      // Thiết lập indexes cho guild profiles
      await GuildProfileDB.setupGuildProfileIndexes();
      
      // Khởi tạo cấu hình guild mặc định cho tất cả các guild hiện có
      for (const [guildId, guild] of client.guilds.cache) {
        try {
          const guildProfile = await GuildProfileDB.getGuildProfile(guildId);
          console.log(`✅ Đã tải cấu hình XP cho guild ${guild.name}`);
        } catch (err) {
          console.error(`❌ Lỗi khi tải cấu hình guild ${guild.name}:`, err);
        }
      }
      
      console.log('✅ Đã khởi tạo hệ thống profile guild');
      initSystem.markReady('guildProfiles');
    } catch (error) {
      console.error('❌ Lỗi khi khởi tạo hệ thống profile guild:', error);
      initSystem.markReady('guildProfiles'); // Đánh dấu là đã sẵn sàng ngay cả khi có lỗi
    }

    try {
      // Khởi tạo mẫu lời chào
      await NeuralNetworks.initializeGreetingPatterns();
      initSystem.markReady('greetingPatterns');
    } catch (error) {
      console.error('❌ Lỗi khi khởi tạo mẫu lời chào:', error);
      initSystem.markReady('greetingPatterns'); // Đánh dấu là đã sẵn sàng ngay cả khi có lỗi
    }

    try {
      // Tải các lệnh khi khởi động
      const commandCount = loadCommands(client);
      console.log('\x1b[32m%s\x1b[0m', `Đã tải tổng cộng ${commandCount} lệnh!`);
      initSystem.markReady('commands');
    } catch (error) {
      console.error('❌ Lỗi khi tải commands:', error);
      initSystem.markReady('commands'); // Đánh dấu là đã sẵn sàng ngay cả khi có lỗi
    }

    try {
      // Kiểm tra kết nối với X.AI API
      const connected = await NeuralNetworks.testConnection();
      initSystem.markReady('api');
    } catch (error) {
      console.error('❌ Lỗi khi kết nối đến X.AI API:', error);
      initSystem.markReady('api'); // Đánh dấu là đã sẵn sàng ngay cả khi có lỗi
    }

    // Set bot presence
    client.user.setPresence({
      activities: [{ name: 'Không phải người | @Luna', type: 4 }],
      status: 'online'
    });

    console.log(`✅ Bot đã sẵn sàng! Đã đăng nhập với tên ${client.user.tag}`);
  });
}

module.exports = { startbot };
