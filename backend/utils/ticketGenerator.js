import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ticket Generation Utilities
export class TicketGenerator {
  constructor() {
    this.ticketTemplate = this.getDefaultTemplate();
  }

  // Generate QR code for ticket
  async generateQRCode(ticketData) {
    try {
      const qrData = {
        ticketNumber: ticketData.ticketNumber,
        eventId: ticketData.eventId,
        userId: ticketData.userId,
        timestamp: Date.now(),
        signature: this.generateSignature(ticketData)
      };

      const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 200
      });

      return {
        success: true,
        dataURL: qrCodeDataURL,
        data: qrCodeDataURL
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Generate PDF ticket
  async generatePDFTicket(ticketData, eventData, userData) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'portrait',
          margins: {
            top: 50,
            bottom: 50,
            left: 50,
            right: 50
          }
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        // Add ticket header
        this.addTicketHeader(doc, eventData);
        
        // Add ticket details
        this.addTicketDetails(doc, ticketData, eventData, userData);
        
        // Add QR code
        this.addQRCode(doc, ticketData);
        
        // Add footer
        this.addTicketFooter(doc, eventData);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Add ticket header to PDF
  addTicketHeader(doc, eventData) {
    // Company/Event logo placeholder
    doc.rect(50, 50, 100, 60)
       .fill('#f0f0f0')
       .fontSize(12)
       .fill('#666')
       .text('LOGO', 75, 80, { align: 'center' });

    // Event title
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .fill('#2c3e50')
       .text('EVENT TICKET', 200, 60, { align: 'center' });

    // Event name
    doc.fontSize(18)
       .font('Helvetica')
       .fill('#34495e')
       .text(eventData.title, 200, 90, { align: 'center' });

    // Divider line
    doc.moveTo(50, 130)
       .lineTo(550, 130)
       .stroke('#bdc3c7')
       .lineWidth(2);
  }

  // Add ticket details to PDF
  addTicketDetails(doc, ticketData, eventData, userData) {
    const startY = 160;
    const lineHeight = 25;

    // Ticket number
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fill('#2c3e50')
       .text('Ticket Number:', 50, startY);
    
    doc.fontSize(12)
       .font('Helvetica')
       .fill('#34495e')
       .text(ticketData.ticketNumber, 200, startY);

    // Event date
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fill('#2c3e50')
       .text('Event Date:', 50, startY + lineHeight);
    
    const eventDate = new Date(eventData.date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    doc.fontSize(12)
       .font('Helvetica')
       .fill('#34495e')
       .text(eventDate, 200, startY + lineHeight);

    // Event time
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fill('#2c3e50')
       .text('Event Time:', 50, startY + lineHeight * 2);
    
    doc.fontSize(12)
       .font('Helvetica')
       .fill('#34495e')
       .text(`${eventData.startTime} - ${eventData.endTime}`, 200, startY + lineHeight * 2);

    // Venue
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fill('#2c3e50')
       .text('Venue:', 50, startY + lineHeight * 3);
    
    doc.fontSize(12)
       .font('Helvetica')
       .fill('#34495e')
       .text(eventData.venue, 200, startY + lineHeight * 3);

    // Attendee name
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fill('#2c3e50')
       .text('Attendee:', 50, startY + lineHeight * 4);
    
    doc.fontSize(12)
       .font('Helvetica')
       .fill('#34495e')
       .text(userData.name, 200, startY + lineHeight * 4);

    // Quantity
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fill('#2c3e50')
       .text('Quantity:', 50, startY + lineHeight * 5);
    
    doc.fontSize(12)
       .font('Helvetica')
       .fill('#34495e')
       .text(ticketData.quantity.toString(), 200, startY + lineHeight * 5);

    // Total amount
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fill('#2c3e50')
       .text('Total Amount:', 50, startY + lineHeight * 6);
    
    doc.fontSize(12)
       .font('Helvetica')
       .fill('#34495e')
       .text(`${eventData.currency} ${ticketData.totalAmount}`, 200, startY + lineHeight * 6);

    // Booking date
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fill('#2c3e50')
       .text('Booking Date:', 50, startY + lineHeight * 7);
    
    const bookingDate = new Date(ticketData.bookingDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    doc.fontSize(12)
       .font('Helvetica')
       .fill('#34495e')
       .text(bookingDate, 200, startY + lineHeight * 7);
  }

  // Add QR code to PDF
  async addQRCode(doc, ticketData) {
    try {
      const qrCodeDataURL = await this.generateQRCode(ticketData);
      
      if (qrCodeDataURL.success) {
        // Convert data URL to buffer
        const base64Data = qrCodeDataURL.dataURL.replace(/^data:image\/png;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        // Add QR code to PDF
        doc.image(imageBuffer, 400, 160, {
          width: 120,
          height: 120
        });

        // Add QR code label
        doc.fontSize(10)
           .font('Helvetica')
           .fill('#7f8c8d')
           .text('Scan for verification', 400, 290, { align: 'center' });
      }
    } catch (error) {
      console.error('Error adding QR code to PDF:', error);
    }
  }

  // Add ticket footer to PDF
  addTicketFooter(doc, eventData) {
    const footerY = 700;

    // Divider line
    doc.moveTo(50, footerY)
       .lineTo(550, footerY)
       .stroke('#bdc3c7')
       .lineWidth(1);

    // Terms and conditions
    doc.fontSize(10)
       .font('Helvetica')
       .fill('#7f8c8d')
       .text('Terms & Conditions:', 50, footerY + 20);
    
    doc.fontSize(9)
       .font('Helvetica')
       .fill('#95a5a6')
       .text('• This ticket is non-transferable', 50, footerY + 35);
    
    doc.fontSize(9)
       .font('Helvetica')
       .fill('#95a5a6')
       .text('• Please arrive 15 minutes before the event', 50, footerY + 50);
    
    doc.fontSize(9)
       .font('Helvetica')
       .fill('#95a5a6')
       .text('• No refunds available unless event is cancelled', 50, footerY + 65);

    // Contact information
    doc.fontSize(10)
       .font('Helvetica')
       .fill('#7f8c8d')
       .text('For support, contact: support@eventticketing.com', 50, footerY + 90, { align: 'center' });
  }

  // Generate HTML ticket template
  generateHTMLTicket(ticketData, eventData, userData) {
    const template = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Event Ticket - ${eventData.title}</title>
        <style>
          body {
            font-family: 'Arial', sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f8f9fa;
          }
          .ticket {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: bold;
          }
          .header h2 {
            margin: 10px 0 0 0;
            font-size: 20px;
            font-weight: normal;
            opacity: 0.9;
          }
          .content {
            padding: 30px;
          }
          .ticket-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
          }
          .info-item {
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
          }
          .info-label {
            font-weight: bold;
            color: #495057;
            margin-bottom: 5px;
          }
          .info-value {
            color: #212529;
          }
          .qr-section {
            text-align: center;
            margin: 30px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
          }
          .qr-code {
            margin: 20px auto;
            padding: 20px;
            background: white;
            border-radius: 8px;
            display: inline-block;
          }
          .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #6c757d;
            font-size: 14px;
          }
          .terms {
            margin-top: 20px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
            font-size: 12px;
            color: #6c757d;
          }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="header">
            <h1>EVENT TICKET</h1>
            <h2>${eventData.title}</h2>
          </div>
          
          <div class="content">
            <div class="ticket-info">
              <div class="info-item">
                <div class="info-label">Ticket Number</div>
                <div class="info-value">${ticketData.ticketNumber}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Event Date</div>
                <div class="info-value">${new Date(eventData.date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Event Time</div>
                <div class="info-value">${eventData.startTime} - ${eventData.endTime}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Venue</div>
                <div class="info-value">${eventData.venue}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Attendee</div>
                <div class="info-value">${userData.name}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Quantity</div>
                <div class="info-value">${ticketData.quantity}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Total Amount</div>
                <div class="info-value">${eventData.currency} ${ticketData.totalAmount}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Booking Date</div>
                <div class="info-value">${new Date(ticketData.bookingDate).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}</div>
              </div>
            </div>
            
            <div class="qr-section">
              <h3>Scan QR Code for Entry</h3>
              <div class="qr-code" id="qr-code">
                <!-- QR code will be generated here -->
              </div>
            </div>
            
            <div class="terms">
              <strong>Terms & Conditions:</strong><br>
              • This ticket is non-transferable<br>
              • Please arrive 15 minutes before the event<br>
              • No refunds available unless event is cancelled<br>
              • For support, contact: support@eventticketing.com
            </div>
          </div>
          
          <div class="footer">
            <p>Thank you for choosing our event!</p>
            <p>Generated on ${new Date().toLocaleDateString('en-US')}</p>
          </div>
        </div>
        
        <script>
          // Generate QR code in the HTML
          const qrData = {
            ticketNumber: '${ticketData.ticketNumber}',
            eventId: '${ticketData.eventId}',
            userId: '${ticketData.userId}',
            timestamp: Date.now()
          };
          
          // You can use a QR code library like qrcode.js here
          // For now, we'll show the ticket number
          document.getElementById('qr-code').innerHTML = 
            '<div style="font-size: 24px; font-weight: bold; color: #333;">${ticketData.ticketNumber}</div>';
        </script>
      </body>
      </html>
    `;

    return template;
  }

  // Generate unique ticket signature
  generateSignature(ticketData) {
    const data = `${ticketData.ticketNumber}-${ticketData.eventId}-${ticketData.userId}-${Date.now()}`;
    return Buffer.from(data).toString('base64').substring(0, 16);
  }

  // Get default ticket template
  getDefaultTemplate() {
    return {
      name: 'Default Template',
      version: '1.0',
      fields: [
        'ticketNumber',
        'eventTitle',
        'eventDate',
        'eventTime',
        'venue',
        'attendeeName',
        'quantity',
        'totalAmount',
        'qrCode'
      ]
    };
  }

  // Validate ticket data
  validateTicketData(ticketData) {
    const required = ['ticketNumber', 'eventId', 'userId', 'quantity', 'totalAmount'];
    const missing = required.filter(field => !ticketData[field]);
    
    if (missing.length > 0) {
      return {
        isValid: false,
        errors: `Missing required fields: ${missing.join(', ')}`
      };
    }

    if (ticketData.quantity < 1 || ticketData.quantity > 10) {
      return {
        isValid: false,
        errors: 'Quantity must be between 1 and 10'
      };
    }

    if (ticketData.totalAmount < 0) {
      return {
        isValid: false,
        errors: 'Total amount cannot be negative'
      };
    }

    return {
      isValid: true,
      errors: null
    };
  }
}

// Export singleton instance
export const ticketGenerator = new TicketGenerator();
