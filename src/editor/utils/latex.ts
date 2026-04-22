import { LaTexUtils, type LaTexSVG } from '../core/draw/particle/latex/utils/LaTexUtils'

export type IResolvedLatexSvg = LaTexSVG

export function convertLatexToSvg(laTex: string): IResolvedLatexSvg {
  return new LaTexUtils(laTex).svg({
    SCALE_X: 10,
    SCALE_Y: 10,
    MARGIN_X: 0,
    MARGIN_Y: 0
  })
}
