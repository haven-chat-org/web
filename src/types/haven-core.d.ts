// Type augmentation for @haven-chat-org/core — adds is_system fields.
// Remove this file after publishing a new version of @haven-chat-org/core with these fields.
import "@haven-chat-org/core";

declare module "@haven-chat-org/core" {
  interface UserPublic {
    is_system?: boolean;
  }

  interface ServerResponse {
    is_system?: boolean;
  }

  interface FriendResponse {
    is_system?: boolean;
  }

  interface ServerMemberResponse {
    is_system?: boolean;
  }

  interface UserProfileResponse {
    is_system?: boolean;
  }
}
