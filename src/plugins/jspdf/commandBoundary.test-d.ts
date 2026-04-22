import type { CommandWithJspdf } from './index'

declare const command: CommandWithJspdf

// @ts-expect-error core command must not expose a PDF snapshot getter
command.getPdfExportSnapshot()
