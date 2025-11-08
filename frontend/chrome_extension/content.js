/**
 * Content script to extract product data from the current page
 * and send it to the background script for processing
 */

(function() {
  'use strict';

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractProductData') {
      const productData = extractProductData();
      sendResponse({ success: true, data: productData });
      return true; // Keep channel open for async response
    }
  });

  /**
   * Extract product data from the current page
   */
  function extractProductData() {
    const data = {};

    // 1. Extract JSON-LD Schema.org data
    const jsonLdData = extractJsonLd();
    Object.assign(data, jsonLdData);

    // 2. Extract microdata
    const microdata = extractMicrodata();
    Object.assign(data, microdata);

    // 3. Extract from visible text
    const textData = extractFromText();
    Object.assign(data, textData);

    // 4. Extract page metadata
    data.url = window.location.href;
    data.title = document.title;

    return data;
  }

  /**
   * Extract JSON-LD structured data
   */
  function extractJsonLd() {
    const data = {};
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');

    scripts.forEach(script => {
      try {
        const jsonData = JSON.parse(script.textContent);
        const items = Array.isArray(jsonData) ? jsonData : [jsonData];

        items.forEach(item => {
          if (isProduct(item)) {
            extractProductFromJsonLd(item, data);
          }
        });
      } catch (e) {
        console.warn('Failed to parse JSON-LD:', e);
      }
    });

    return data;
  }

  /**
   * Check if JSON-LD item is a Product
   */
  function isProduct(item) {
    const type = item['@type'];
    if (!type) return false;
    
    const types = Array.isArray(type) ? type : [type];
    return types.some(t => 
      typeof t === 'string' && t.includes('Product')
    );
  }

  /**
   * Extract product data from JSON-LD item
   */
  function extractProductFromJsonLd(item, data) {
    // Identifiers
    if (item.gtin13 || item.gtin14 || item.gtin8 || item.gtin) {
      data.gtin = item.gtin13 || item.gtin14 || item.gtin8 || item.gtin;
    }
    if (item.mpn) data.mpn = item.mpn;
    if (item.brand) {
      data.brand = typeof item.brand === 'string' 
        ? item.brand 
        : (item.brand.name || item.brand['@value'] || '');
    }
    if (item.model) data.model = item.model;
    if (item.name) data.name = item.name;
    if (item.description) data.description = item.description;

    // Physical attributes
    if (item.weight) data.weight = item.weight;
    if (item.shippingWeight) data.shipping_weight = item.shippingWeight;
    if (item.depth) data.depth = item.depth;
    if (item.width) data.width = item.width;
    if (item.height) data.height = item.height;
    if (item.material) data.material = item.material;

    // Energy labels
    if (item.energyEfficiencyScaleMin !== undefined) {
      data.energy_efficiency_scale_min = item.energyEfficiencyScaleMin;
    }
    if (item.energyEfficiencyScaleMax !== undefined) {
      data.energy_efficiency_scale_max = item.energyEfficiencyScaleMax;
    }
    if (item.energyConsumptionKwhPerYear !== undefined) {
      data.energy_consumption_kwh_per_year = item.energyConsumptionKwhPerYear;
    }
    if (item.noise) data.noise = item.noise;

    // Provenance
    if (item.countryOfOrigin) data.country_of_origin = item.countryOfOrigin;
    if (item.manufacturer) {
      data.manufacturer = typeof item.manufacturer === 'string'
        ? item.manufacturer
        : (item.manufacturer.name || '');
    }

    // Commerce context
    if (item.offers) {
      const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
      offers.forEach(offer => {
        if (offer.price !== undefined) {
          data.price = parseFloat(offer.price);
        }
        if (offer.priceCurrency) data.currency = offer.priceCurrency;
        if (offer.availability) data.availability = offer.availability;
        if (offer.shippingDetails) {
          data.shipping_details = offer.shippingDetails;
        }
        if (offer.deliveryTime) {
          const dt = offer.deliveryTime;
          data.delivery_time = typeof dt === 'object' ? dt.value : dt;
        }
      });
    }

    // Category
    if (item.category) data.category = item.category;

    // Breadcrumbs
    if (item.breadcrumb && item.breadcrumb.itemListElement) {
      data.breadcrumbs = item.breadcrumb.itemListElement
        .map(item => item.name)
        .filter(Boolean);
    }
  }

  /**
   * Extract microdata (simplified)
   */
  function extractMicrodata() {
    const data = {};
    const products = document.querySelectorAll('[itemtype*="Product"]');

    products.forEach(product => {
      // Extract common microdata properties
      const name = product.querySelector('[itemprop="name"]');
      if (name) data.name = name.textContent.trim();

      const price = product.querySelector('[itemprop="price"]');
      if (price) {
        const priceValue = price.getAttribute('content') || price.textContent;
        data.price = parseFloat(priceValue.replace(/[^0-9.]/g, ''));
      }

      const currency = product.querySelector('[itemprop="priceCurrency"]');
      if (currency) {
        data.currency = currency.getAttribute('content') || currency.textContent.trim();
      }
    });

    return data;
  }

  /**
   * Extract data from visible text using patterns
   */
  function extractFromText() {
    const data = {};
    const text = document.body.innerText || '';

    // Weight patterns
    const weightPatterns = [
      /(?:weight|shipping\s+weight)[\s:–-]+([\d\.,]+)\s*(kg|g|lb|oz|pounds?|ounces?)/i,
      /([\d\.,]+)\s*(kg|g|lb|oz)\s*(?:weight|shipping)/i
    ];

    for (const pattern of weightPatterns) {
      const match = text.match(pattern);
      if (match && !data.weight) {
        const value = parseFloat(match[1].replace(/,/g, ''));
        const unit = match[2].toLowerCase();
        data.weight = normalizeWeight(value, unit);
        break;
      }
    }

    // Dimensions
    const dimMatch = text.match(/([\d\.,]+)\s*(?:×|x|X)\s*([\d\.,]+)\s*(?:×|x|X)?\s*([\d\.,]+)?\s*(cm|m|in|inch)/i);
    if (dimMatch && !data.dimensions) {
      data.dimensions = dimMatch.slice(1).filter(Boolean);
    }

    // Battery capacity
    const batteryMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:Wh|mAh|mah)/i);
    if (batteryMatch && !data.battery_capacity) {
      data.battery_capacity = parseFloat(batteryMatch[1]);
    }

    // Display size
    const displayMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:inch|"|inches?)\s*(?:display|screen)/i);
    if (displayMatch && !data.display_size) {
      data.display_size = parseFloat(displayMatch[1]);
    }

    // Warranty
    const warrantyMatch = text.match(/(\d+)\s*(?:year|yr|month|mo)\s*(?:warranty|guarantee)/i);
    if (warrantyMatch && !data.warranty_years && !data.warranty_months) {
      const value = parseInt(warrantyMatch[1]);
      const unit = warrantyMatch[2].toLowerCase();
      if (unit.includes('year') || unit.includes('yr')) {
        data.warranty_years = value;
      } else {
        data.warranty_months = value;
      }
    }

    // Price (fallback if not in structured data)
    if (!data.price) {
      const priceMatch = text.match(/\$?([\d,]+\.?\d*)/);
      if (priceMatch) {
        data.price = parseFloat(priceMatch[1].replace(/,/g, ''));
        data.currency = data.currency || 'USD';
      }
    }

    return data;
  }

  /**
   * Normalize weight to kilograms
   */
  function normalizeWeight(value, unit) {
    const unitLower = unit.toLowerCase();
    if (unitLower.includes('kg') || unitLower.includes('kilogram')) {
      return value;
    } else if (unitLower.includes('g') || unitLower.includes('gram')) {
      return value / 1000.0;
    } else if (unitLower.includes('lb') || unitLower.includes('pound')) {
      return value * 0.453592;
    } else if (unitLower.includes('oz') || unitLower.includes('ounce')) {
      return value * 0.0283495;
    }
    return value; // Assume kg
  }
})();

