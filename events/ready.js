const NeuralNetworks = require('../services/NeuralNetworks');
const mongoClient = require('../services/mongoClient.js');
const storageDB = require('../services/storagedb.js');
const initSystem = require('../services/initSystem.js');

async function startbot(client, loadCommands) {
  client.once('ready', async () => {
    console.log('\x1b[35m%s\x1b[0m', `
    ██╗     ██╗   ██╗███╗   ██╗ █████╗ 
    ██║     ██║   ██║████╗  ██║██╔══██╗
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
        initSystem.markReady('greetingPatterns');
    } catch (error) {
        console.error('❌ Lỗi khi khởi tạo cấu trúc lịch sử cuộc trò chuyện:', error);
        initSystem.markReady('greetingPatterns'); // Đánh dấu là đã sẵn sàng ngay cả khi có lỗi
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
    
    // Sau khi tất cả đã sẵn sàng, initSystem sẽ tự động phát sự kiện 'ready'
    // từ đó các module khác sẽ bắt đầu hoạt động
  });
}

module.exports = { startbot };
