import { gql } from "@apollo/client";

export const DeleteInviteMutation = gql`
  mutation InvalidateChatInvite($input: InvalidateInviteInput!) {
    invalidateChatInvite(input: $input) {
      success
    }
  }
`;