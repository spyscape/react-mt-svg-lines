import React from 'react';
import PropTypes from 'prop-types';

import TWEEN from '@tweenjs/tween.js';
import { clamp, trimFloat, isMsBrowser } from './utils.js';

const EASING = {
  ease: TWEEN.Easing.Quadratic.InOut,
  'ease-in': TWEEN.Easing.Cubic.In,
  'ease-out': TWEEN.Easing.Cubic.Out,
  'ease-in-out': TWEEN.Easing.Cubic.InOut,
  linear: TWEEN.Easing.Linear.None,
  'step-start': TWEEN.Easing.Bounce.In, // not quite the same thing ;)
  'step-end': TWEEN.Easing.Bounce.Out, // not quite the same thing ;)
};

export default class MtSvgLines extends React.Component {
  static propTypes = {
    className: PropTypes.string, // custom CSS class (applied to svg elem)
    animate: PropTypes.oneOfType([
      // external animation trigger
      PropTypes.string, // - pass a unique string or true to (re)start animation
      PropTypes.number, // - pass a number to specify delay before the animation begins (ms)
      PropTypes.bool, // - pass false (or omit) to draw static SVG (no animation)
    ]),
    duration: PropTypes.number, // total anim duration (ms)
    stagger: PropTypes.number, // delay between start times of each path (percentage)
    timing: PropTypes.oneOf([
      'ease',
      'ease-in',
      'ease-out',
      'ease-in-out',
      'linear',
      'step-start',
      'step-end',
    ]),
    playback: PropTypes.string, // iteration-count || direction || fill-mode (perhaps even play-state)
    fade: PropTypes.bool, // apply a fade-in to each path
    callback: PropTypes.func, // callback fn to run when when anim completes
    jsOnly: PropTypes.bool, // apply JS animation, regardless of browser
    children: PropTypes.node,
  };

  // defaults
  static defaultProps = {
    className: 'mt-svg',
    animate: false,
    duration: 1000,
    stagger: 0,
    timing: 'ease',
    playback: 'forwards',
    fade: false,
    callback: () => {},
    jsOnly: false,
  };

  constructor(props) {
    super(props);

    this.state = {
      classKey: `mt-init`, // unique class name for the wrapper, an internal "trigger" (must be different for anim to start)
      css: '', // generated CSS
    };

    this._lastAnimate = '';
    this._lastClassKey = '';

    this._animStart = 0; // anim start timestamp

    this._svgWrapper = null;
    this._pathElems = [];
    this._pathDataFrom = {};
    this._pathDataTo = {};
    this._tweenData = {};
  }

  componentDidMount() {
    this.animate();
  }

  componentDidUpdate() {
    const { animate } = this.props;
    if (this._lastAnimate !== animate) {
      this._lastAnimate = animate;
      this.setState({ classKey: `mt-${String(animate)}` }, this.animate);
    } else {
      this.animate();
    }
  }

  // ------------------------------------------------------

  /*
   * On each Tween update, set dash offsets to newly tweened values
   */
  onTweenUpdate = () => {
    this.setStrokeDashoffset(this._pathElems, this._tweenData);
    this.animate(); // go again..
  };

  /*
   * When animation completes, run callback (if any), clear start timestamp
   */
  onAnimComplete = () => {
    this.props.callback();
    this._animStart = 0;
  };

  /*
   * Generate an object containing 'from' and 'to' sub-objects
   * Each object contains same set of indexed keys, per the path selection
   * The 'from' object values are the paths' lengths
   * The 'to' object values are 0 (unless 'skip' attr is present, then equal path's length)
   */
  getPathData(pathElems) {
    const pathData = { from: {}, to: {} };

    [].forEach.call(pathElems, (pathEl, i) => {
      if (!this.hasSkipAttr(pathEl.attributes)) {
        const pathLengh = trimFloat(pathEl.getTotalLength() || 0);
        pathData.from[i] = pathLengh;
        pathData.to[i] = 0;
      }
    });

    return pathData;
  }

  /*
   * Acquire selection of 'path' elems contained within the SVG wrapper
   */
  selectPathElems() {
    const svgEl = this._svgWrapper && this._svgWrapper.getElementsByTagName('svg')[0];
    return svgEl ? svgEl.querySelectorAll('path') : [];
  }

  /*
   * Check path's attributes for data-mt="skip"
   */
  hasSkipAttr(attributes) {
    let result = false;

    // path.attributes is an obj with indexed keys, so we must iterate over them
    // { '0': { name: 'd', value: 'M37.063' }, '1': { name: 'data-mt', value: 'skip' }, ... }
    for (const key in attributes) {
      const { name, value } = attributes[key];
      if (!result && name === 'data-mt' && value === 'skip') {
        result = true;
        break;
      }
    }

    return result;
  }

  /*
   * Set style.strokeDasharray on all paths in selection, from the provided key-val object
   */
  setStrokeDasharray(pathElems, pathData) {
    [].forEach.call(pathElems, (pathEl, i) => {
      if (pathData[i]) {
        pathEl.style.strokeDasharray = pathData[i];
      }
    });
  }

  /*
   * Set style.strokeDashoffset on all paths in selection, from the provided key-val object
   */
  setStrokeDashoffset(pathElems, pathData) {
    [].forEach.call(pathElems, (pathEl, i) => {
      if (pathData[i]) {
        pathEl.style.strokeDashoffset = pathData[i];
      }
    });
  }

  /*
   * Return an array containing lengths of all path elems inside the SVG
   */
  getPathLengths() {
    const pathElems = this.selectPathElems();
    return [].map.call(pathElems, pathEl => {
      if (!pathEl.getTotalLength) return 0;

      return this.hasSkipAttr(pathEl.attributes) ? 0 : trimFloat(pathEl.getTotalLength() || 0);
    });
  }

  /*
   * Return CSS for a single path elem (using classKey and path index as the CSS selector)
   */
  getPathCss(index, length, startDelay, staggerDelay, duration) {
    const { classKey } = this.state;
    const { timing, playback, fade } = this.props;

    const keysId = `${classKey}-${index + 1}`;
    const totalDelay = length ? trimFloat((startDelay + staggerDelay * index) / 1000) : 0;
    const startOpacity = fade ? 0.01 : 1;

    duration = duration ? trimFloat(duration / 1000) : 0;

    return `
      @-webkit-keyframes ${keysId} {
        0%   { stroke-dashoffset: ${length}; opacity: ${startOpacity}; }
        100% { stroke-dashoffset: 0; opacity: 1; }
      }
      @keyframes ${keysId} {
        0%   { stroke-dashoffset: ${length}; opacity: ${startOpacity}; }
        100% { stroke-dashoffset: 0; opacity: 1; }
      }
      .${classKey} path:nth-of-type( ${index + 1} ) {
        opacity:                 0.01;
        stroke-dasharray:        ${length};
        stroke-dashoffset:       ${length};
        -webkit-animation:       ${keysId} ${duration}s ${timing} ${playback};
        animation:               ${keysId} ${duration}s ${timing} ${playback};
        -webkit-animation-delay: ${totalDelay}s;
        animation-delay:         ${totalDelay}s;
      }
    `;
  }

  /*
   * Main animate handler, called after each render update
   */
  animate() {
    if (typeof window === 'undefined') {
      return;
    }

    const { animate, duration, stagger, timing, playback, jsOnly } = this.props;
    const { classKey } = this.state;

    const isStartNewAnim = animate !== false && classKey !== this._lastClassKey;
    const isAnimJS = isMsBrowser() || jsOnly;

    // >>> STARTING NEW ANIMATION...
    if (isStartNewAnim) {
      // set flags
      this._animStart = Date.now();
      this._lastClassKey = classKey;

      // parse out vars common for both modes
      const startDelay = typeof animate === 'number' ? animate : 0; // if numeric, treat as delay (ms)
      let numOfRepeats = parseInt(playback, 10) || 1;

      /* ----- JS MODE ----- */
      if (isAnimJS) {
        // parse props for use with Tween.js
        if (numOfRepeats > 0) {
          numOfRepeats -= 1;
        }
        if (playback.includes('infinite')) {
          numOfRepeats = Infinity;
        }
        const isYoYo = playback.includes('alternate');

        // acquire path elems and generate to/from data sets
        this._pathElems = this.selectPathElems();
        const pathData = this.getPathData(this._pathElems);
        this._pathDataFrom = pathData.from;
        this._pathDataTo = pathData.to;

        // TODO: if ( contains( playback, 'reverse' ) ) { ... };

        // init tweener object
        this._tweenData = { ...this._pathDataFrom };

        // set paths' offsets to start positions
        this.setStrokeDasharray(this._pathElems, this._pathDataFrom);
        this.setStrokeDashoffset(this._pathElems, this._tweenData);

        // init the tweener..
        const tween = new TWEEN.Tween(this._tweenData)
          .to(this._pathDataTo, duration)
          .easing(EASING[timing])
          .repeat(numOfRepeats)
          .yoyo(isYoYo)
          .onUpdate(this.onTweenUpdate)
          .onComplete(this.onAnimComplete);

        // kick off JS tweening..
        const t = setTimeout(() => {
          tween.start();
          TWEEN.update();
          clearTimeout(t);
        }, Math.max(1, startDelay));

        /* ----- CSS MODE ----- */
      } else {
        let css = '';

        // 1) determine number of path elems in svg
        const pathLenghts = this.getPathLengths();
        const pathQty = pathLenghts.length || 1;

        // 2) calc all timing values
        const staggerMult = clamp(stagger, 0, 100) / 100; // convert pct to 0-1
        const pathStaggerDelay = stagger > 0 ? (duration / pathQty) * staggerMult : 0;
        const pathDrawDuration =
          stagger > 0 ? duration - pathStaggerDelay * (pathQty - 1) * (2 - staggerMult) : duration;

        // 3) concat generated CSS, one path at a time..
        pathLenghts.forEach((length, index) => {
          css += this.getPathCss(index, length, startDelay, pathStaggerDelay, pathDrawDuration);
        });

        // set up on-complete timer
        const t = setTimeout(() => {
          clearTimeout(t);
          this.onAnimComplete();
        }, startDelay + duration * numOfRepeats);

        // set state (re-render)
        this.setState({ css });
      }

      // >>> ONGOING ANIMATION...
    } else if (this._animStart) {
      /* ----- JS MODE ----- */
      if (isAnimJS) {
        window.requestAnimationFrame(TWEEN.update);

        /* ----- CSS MODE ----- */
      } else {
        // NOTE: nothing to do, browser does its thing...
      }
    }
  }

  // ------------------------------------------------------

  render() {
    // destruct all component-specific props, so '...rest' can be applied to wrapper <span>
    // eslint-disable-next-line no-unused-vars
    const {
      className,
      animate,
      duration,
      stagger,
      timing,
      playback,
      fade,
      jsOnly,
      children,
      callback,
      ...rest
    } = this.props;
    const { classKey, css } = this.state;
    const isServer = typeof window === 'undefined';
    const isDelayed = typeof animate === 'number' && animate > 0;
    const isHidden = animate === 'hide';
    const opacity = (isServer && isDelayed) || isHidden ? 0.01 : 1;

    return (
      <span
        ref={c => {
          this._svgWrapper = c;
        }}
        className={`${className} ${classKey}`}
        style={{ opacity }}
        {...rest}
      >
        <style>{css}</style>
        {children}
      </span>
    );
  }
}
