import json
import requests
import os
import time
from PIL import Image
import sys
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Constants
HERO_LIST_URL = "https://static.smilegatemegaport.com/gameRecord/epic7/epic7_hero.json"
HERO_JSON = 'epic7_hero.json'
IMAGE_DIR = 'hero_images'
FLIPPED_IMAGE_DIR = 'hero_images_reversed'
API_BASE_URL = "https://epic7db.com/api/heroes"
API_KEY = "mikeyfogs"

def format_hero_name(name):
    special_cases = {
        "Ainos 2.0": "ainos-20",
        "Jack-O'": "jack-o",
        "Baal and Sezan": "baal-and-sezan",
        "Sage Baal and Sezan": "sage-baal-and-sezan"
    }
    return special_cases.get(name, name.replace(' ', '-').lower())

def download_hero_list():
    try:
        response = requests.get(HERO_LIST_URL, timeout=10)
        response.raise_for_status()
        hero_list = response.json()
        with open(HERO_JSON, 'w', encoding='utf-8') as file:
            json.dump(hero_list, file, indent=4)
        print(f"Hero list downloaded and saved to {HERO_JSON}")
        return hero_list
    except requests.exceptions.RequestException as e:
        print(f"Failed to download hero list: {e}")
        return None

def image_exists(hero_name):
    return os.path.exists(os.path.join(IMAGE_DIR, f"{hero_name}.png"))

def flipped_image_exists(hero_name):
    return os.path.exists(os.path.join(FLIPPED_IMAGE_DIR, f"{hero_name}.png"))

def download_image(hero_name):
    if image_exists(hero_name):
        print(f"Image for {hero_name} already exists. Skipping download.")
        return os.path.join(IMAGE_DIR, f"{hero_name}.png")

    try:
        url = f"{API_BASE_URL}/{hero_name}/{API_KEY}"
        print(f"Fetching data for {hero_name} from URL: {url}")
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        hero_data = response.json()
        
        image_url = hero_data.get('image')
        
        if not image_url:
            print(f"No image URL found in API response for {hero_name}")
            return None

        print(f"Image URL for {hero_name}: {image_url}")
        img_response = requests.get(image_url, stream=True, timeout=10)
        img_response.raise_for_status()
        image_path = os.path.join(IMAGE_DIR, f"{hero_name}.png")
        with open(image_path, 'wb') as file:
            for chunk in img_response.iter_content(chunk_size=8192):
                file.write(chunk)
        print(f"Downloaded image for {hero_name}")
        return image_path
    except requests.exceptions.RequestException as e:
        print(f"Failed to download image for {hero_name}: {e}")
        return None

def flip_image(input_path, hero_name):
    output_path = os.path.join(FLIPPED_IMAGE_DIR, f"{hero_name}.png")
    if os.path.exists(output_path):
        print(f"Flipped image for {hero_name} already exists. Skipping.")
        return

    try:
        with Image.open(input_path) as img:
            flipped_img = img.transpose(Image.FLIP_LEFT_RIGHT)
            flipped_img.save(output_path)
        print(f"Flipped image for {hero_name}")
    except Exception as e:
        print(f"Failed to flip image for {hero_name}: {e}")

def update_hero_images():
    print("Starting hero image update process...")
    
    # Ensure directories exist
    os.makedirs(IMAGE_DIR, exist_ok=True)
    os.makedirs(FLIPPED_IMAGE_DIR, exist_ok=True)

    # Download the latest hero list
    hero_list = download_hero_list()
    if not hero_list:
        print("Failed to download hero list. Exiting.")
        return

    for hero in hero_list['en']:
        original_name = hero['name']
        hero_name = format_hero_name(original_name)
        print(f"\nProcessing hero: {original_name} (formatted: {hero_name})")
        
        image_path = download_image(hero_name)
        if image_path:
            flip_image(image_path, hero_name)
        else:
            print(f"Failed to process images for {hero_name}")
        
        time.sleep(1)  # Reduced delay to 1 second

    print("\nHero image update completed.")

if __name__ == "__main__":
    print(f"Script started. Python version: {sys.version}")
    print(f"Working directory: {os.getcwd()}")
    update_hero_images()
    print("Script finished.")