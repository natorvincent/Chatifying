package com.chatify.backend.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.Map;
import com.chatify.backend.model.Reaction;

@Entity
@Table(name = "messages")
public class Message {
    @Id
    @Column(length = 36)
    private String messageId;

    @Column(nullable = false)
    private String chatId;

    @Column(nullable = false)
    private String senderId;

    @Column(columnDefinition = "TEXT")
    private String messageOG;

    @Column(columnDefinition = "TEXT")
    private String message;

    private LocalDateTime timestamp;

    private String type;   // e.g. "image"
    private String imageUrl;

    private String replyToMessageId;
    private String replyToSenderId;
    @Column(columnDefinition = "TEXT")
    private String replyToMessage;
    private String replyToType;

    private String messageVar1;
    private String messageVar2;
    private String messageVar3;

    @Column(name = "is_read_message")
    private Boolean isReadMessage;

    @ElementCollection
    @CollectionTable(name = "message_reactions", joinColumns = @JoinColumn(name = "message_id"))
    @MapKeyColumn(name = "reaction_id", length = 191)
    @Column(name = "reaction_data")
    private Map<String, Reaction> reactions;

    @PrePersist
    public void prePersist() {
        if (messageId == null) {
            messageId = UUID.randomUUID().toString();
        }
        if (timestamp == null) {
            timestamp = LocalDateTime.now();
        }
        if (isReadMessage == null) {
            isReadMessage = false;
        }
    }

    // Getters and setters
    public String getMessageId() { return messageId; }
    public void setMessageId(String messageId) { this.messageId = messageId; }
    public String getChatId() { return chatId; }
    public void setChatId(String chatId) { this.chatId = chatId; }
    public String getSenderId() { return senderId; }
    public void setSenderId(String senderId) { this.senderId = senderId; }
    public String getMessageOG() { return messageOG; }
    public void setMessageOG(String messageOG) { this.messageOG = messageOG; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
    public String getReplyToMessageId() { return replyToMessageId; }
    public void setReplyToMessageId(String replyToMessageId) { this.replyToMessageId = replyToMessageId; }
    public String getReplyToSenderId() { return replyToSenderId; }
    public void setReplyToSenderId(String replyToSenderId) { this.replyToSenderId = replyToSenderId; }
    public String getReplyToMessage() { return replyToMessage; }
    public void setReplyToMessage(String replyToMessage) { this.replyToMessage = replyToMessage; }
    public String getReplyToType() { return replyToType; }
    public void setReplyToType(String replyToType) { this.replyToType = replyToType; }
    public String getMessageVar1() { return messageVar1; }
    public void setMessageVar1(String messageVar1) { this.messageVar1 = messageVar1; }
    public String getMessageVar2() { return messageVar2; }
    public void setMessageVar2(String messageVar2) { this.messageVar2 = messageVar2; }
    public String getMessageVar3() { return messageVar3; }
    public void setMessageVar3(String messageVar3) { this.messageVar3 = messageVar3; }
    public Boolean getIsReadMessage() { return isReadMessage; }
    public void setIsReadMessage(Boolean isReadMessage) { this.isReadMessage = isReadMessage; }
    public boolean isRead() { return isReadMessage != null && isReadMessage; }
    public Map<String, Reaction> getReactions() { return reactions; }
    public void setReactions(Map<String, Reaction> reactions) { this.reactions = reactions; }

    // Create a convenience method to check if this message is a reply
    public boolean isReply() {
        return replyToMessageId != null && !replyToMessageId.isEmpty();
    }
} 