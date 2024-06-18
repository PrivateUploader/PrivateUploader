import { gql } from "@apollo/client";

export const UpdateUploadsSubscription = gql`
  subscription OnUpdateUploads {
    onUpdateUploads {
      id
      createdAt
      updatedAt
      attachment
      userId
      name
      originalFilename
      type
      fileSize
      deletable
      textMetadata
      collections {
        id
        name
      }
      starred {
        id
      }
    }
  }
`;