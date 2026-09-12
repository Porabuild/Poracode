import SwiftUI

struct ProjectDirectoryBrowser: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var controller: ProjectControllerDirectoryController
  let initialPath: String
  let select: (String) -> Void

  var body: some View {
    NavigationStack {
      Group {
        if controller.state.isLoading, controller.state.listing == nil {
          LoadingStateView(message: ProjectManagementStrings.loading)
        } else if let listing = controller.state.listing {
          directoryList(listing)
        } else if let failure = controller.state.failure {
          ErrorStateView(
            message: ProjectFailureText.message(for: failure),
            retryTitle: ProjectManagementStrings.retry
          ) {
            Task { await controller.navigate(to: controller.state.requestedPath) }
          }
        } else {
          LoadingStateView(message: ProjectManagementStrings.loading)
        }
      }
      .navigationTitle(ProjectManagementStrings.folder)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(ProjectManagementStrings.cancel) { dismiss() }
        }
        if let listing = controller.state.listing, !listing.isDriveList {
          ToolbarItem(placement: .confirmationAction) {
            Button(ProjectManagementStrings.useFolder) {
              select(listing.path)
              dismiss()
            }
          }
        }
      }
    }
    .task(id: initialPath) {
      await controller.navigate(to: initialPath)
    }
  }

  private func directoryList(_ listing: BrowseHostDirectoryResult) -> some View {
    List {
      Section {
        Label {
          Text(listing.isDriveList ? ProjectManagementStrings.folder : listing.path)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(2)
            .textSelection(.enabled)
        } icon: {
          Image(systemName: listing.isDriveList ? "externaldrive" : "folder")
            .foregroundStyle(.secondary)
        }
        if let parent = listing.parentPath {
          Button {
            Task { await controller.navigate(to: parent) }
          } label: {
            Label(ProjectManagementStrings.parent, systemImage: "arrow.up")
          }
        }
        if listing.path != listing.homePath {
          Button {
            Task { await controller.navigate(to: listing.homePath) }
          } label: {
            Label(ProjectManagementStrings.home, systemImage: "house")
          }
        }
      }

      Section {
        ForEach(listing.entries.filter { $0.type == .directory }) { entry in
          Button {
            Task { await controller.navigate(to: entry.path) }
          } label: {
            HStack {
              Label(entry.name, systemImage: "folder")
              Spacer()
              Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
            }
          }
          .foregroundStyle(.primary)
        }

        ForEach(listing.entries.filter { $0.type == .file }) { entry in
          Label(entry.name, systemImage: "doc")
            .foregroundStyle(.secondary)
        }
      } footer: {
        if listing.truncated {
          Text(ProjectManagementStrings.truncated)
        }
      }
    }
    .overlay {
      if controller.state.isLoading { ProgressView() }
    }
  }
}
