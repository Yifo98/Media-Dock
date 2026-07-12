export type RuntimeToolInstallTarget = 'deno' | 'yt-dlp'

export class RuntimeOperationCoordinator {
  private runtimeInstallTarget: RuntimeToolInstallTarget | null = null
  private downloadStartPending = false

  claimRuntimeInstall(tool: RuntimeToolInstallTarget, hasActiveDownloads: boolean) {
    if (hasActiveDownloads || this.downloadStartPending) {
      throw new Error('Stop active downloads before updating runtime tools.')
    }
    if (this.runtimeInstallTarget) {
      throw new Error(`Wait for the active ${this.runtimeInstallTarget} update to finish before updating ${tool}.`)
    }
    this.runtimeInstallTarget = tool
  }

  releaseRuntimeInstall(tool: RuntimeToolInstallTarget) {
    if (this.runtimeInstallTarget === tool) {
      this.runtimeInstallTarget = null
    }
  }

  claimDownloadStart(hasActiveDownloads: boolean) {
    if (hasActiveDownloads || this.downloadStartPending) {
      throw new Error('A download queue is already running or being prepared.')
    }
    if (this.runtimeInstallTarget) {
      throw new Error(`Wait for the active ${this.runtimeInstallTarget} update to finish before downloading.`)
    }
    this.downloadStartPending = true
  }

  releaseDownloadStart() {
    this.downloadStartPending = false
  }
}
